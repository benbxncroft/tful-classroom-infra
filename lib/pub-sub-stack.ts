import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import ecr = require('@aws-cdk/aws-ecr');
import ecs = require('@aws-cdk/aws-ecs');
import ecsPatterns = require('@aws-cdk/aws-ecs-patterns');
import elasticache = require('@aws-cdk/aws-elasticache');
import cloudfront = require('@aws-cdk/aws-cloudfront');
import route53 = require('@aws-cdk/aws-route53');
import route53target = require('@aws-cdk/aws-route53-targets');
import certificatemanager = require('@aws-cdk/aws-certificatemanager');
import dynamodb = require('@aws-cdk/aws-dynamodb');
import iam = require('@aws-cdk/aws-iam');
import logs = require('@aws-cdk/aws-logs');
import { Context } from "./context";
import { CloudFrontAllowedMethods } from "@aws-cdk/aws-cloudfront";
import { PropagatedTagSource } from "@aws-cdk/aws-ecs";

export class PubSubStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const context = new Context(scope);

        // get the pubsub docker image
        const pubsubImageRepository = ecr.Repository.fromRepositoryName(this,'pubsub', context.environmentPrefixedName('pubsub'));
        const image = ecs.ContainerImage.fromEcrRepository(pubsubImageRepository, 'latest');

        const vpc = new ec2.Vpc(this, 'Vpc', {
            maxAzs: 2
        });

        // create a cluster manually so we can name it (used for service updates in code deploys)
        const cluster = new ecs.Cluster(this, 'PubSubCluster', {
            clusterName: context.environmentPrefixedName('PubSubCluster'),
            vpc: vpc,
            containerInsights: true
        });

        const subnetGroup = new elasticache.CfnSubnetGroup( this, "RedisClusterPrivateSubnetGroup", {
            subnetIds: vpc.privateSubnets.map((subnet) => { return subnet.subnetId; }),
            description: "private subnet",
            cacheSubnetGroupName: context.environmentPrefixedName('RedisSubnetGroup')
        });

        const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
            vpc: vpc,
            allowAllOutbound: false,
            securityGroupName: 'Allow access to Redis from Pub Sub Service fargate task',
        });

        // TODO: Remove when ApplicationLoadBalancedFargateService supports custom security groups
        redisSecurityGroup.connections.allowFrom(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(6379));

        const redis = new elasticache.CfnReplicationGroup( this, 'RedisReplicaGroup', {
            engine: "redis",
            autoMinorVersionUpgrade: true,
            preferredMaintenanceWindow: "tue:01:00-tue:05:00",
            cacheNodeType: context.get('redisNodeType'),
            replicasPerNodeGroup: parseInt(context.get('redisReplicasPerNodeGroup')),
            numNodeGroups: 1,
            automaticFailoverEnabled: true,
            replicationGroupDescription: "Redis Cluster",
            cacheSubnetGroupName: subnetGroup.cacheSubnetGroupName,
            securityGroupIds: [redisSecurityGroup.securityGroupId],
        });

        redis.addDependsOn(subnetGroup);

        const redisUri = redis.attrPrimaryEndPointAddress + ':' + redis.attrPrimaryEndPointPort;

        // DynamoDB tables
        const unorderedTable = new dynamodb.Table(this, 'Unordered', {
            partitionKey: { name: 'LessonId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'ActionAndUserId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        const orderedTable = new dynamodb.Table(this, 'Ordered', {
            partitionKey: { name: 'LessonIdAndGroup', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'Order', type: dynamodb.AttributeType.NUMBER },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // create a load-balanced fargate service

        // TODO: Add when ApplicationLoadBalancedFargateService supports custom security groups
        /*const pubsubSecurityGroup = new ec2.SecurityGroup(this, 'PubSubServiceSecurityGroup', {
            vpc: vpc,
            allowAllOutbound: false
        });
        */

        const logGroup = new logs.LogGroup(this, 'LogGroup', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            retention: logs.RetentionDays.ONE_MONTH
        });

        // create log metrics for warnings, errors and fatal crashes
        [{
            name: 'Fatal',
            level: '60'
        }, {
            name: 'Error',
            level: '50'
        }, {
            name: 'Warn',
            level: '40'
        }].forEach((metricConfig) => {
            logGroup.addMetricFilter('PubSubLogGroupMetric' + metricConfig.name, {
                filterPattern: {
                    logPatternString: '{ $.level = ' + metricConfig.level + ' }'
                },
                metricNamespace: context.environmentPrefixedName('PubSub'),
                metricName: metricConfig.name,
                defaultValue: 0,
            })
        })

        const loadBalancedFargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "PubSubService", {
            // to change cpu/memory, see https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ecs-patterns.ApplicationLoadBalancedFargateService.html#cpu
            taskImageOptions: {
                image: image,
                environment: {
                    SECRET: context.get('headerSecret'),
                    REDIS_URI: redisUri,
                    UNORDERED_TABLE: unorderedTable.tableName,
                    ORDERED_TABLE: orderedTable.tableName,
                    ORIGIN: context.allDomains('classroom').map(domain => 'https://' + domain).join(','),
                    DYNAMO_REGION: this.node.tryGetContext('region')
                },
                containerPort: this.node.tryGetContext('applicationPort'),
                logDriver: new ecs.AwsLogDriver({
                    streamPrefix: this.node.id,
                    logGroup
                }),
            },
            cpu: context.get('fargateCPU'),
            memoryLimitMiB: context.get('fargateMemory'),
            propagateTags: PropagatedTagSource.TASK_DEFINITION,
            publicLoadBalancer: true,
            listenerPort: this.node.tryGetContext('applicationPort'),
            serviceName: context.environmentPrefixedName('PubSubService'),
            cluster: cluster,
            desiredCount: 2
            // TODO: Add when ApplicationLoadBalancedFargateService supports custom security groups
            // securityGroup: pubsubSecurityGroup
        });

        // Wait less time for in-flight requests to complete before deregistering the target instance
        // https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html#deregistration-delay
        // This may help to speed up ECS stabilization during deployments
        loadBalancedFargateService.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '10');

        // Round robin doesn't work well for websockets that are long lasting, use LOR instead
        // https://medium.com/dazn-tech/introducing-pubby-our-custom-websockets-solution-c5764e3a7dcb
        loadBalancedFargateService.targetGroup.setAttribute('load_balancing.algorithm.type', 'least_outstanding_requests');

        const dynamoActions = [
            'dynamodb:BatchGetItem',
            'dynamodb:BatchWriteItem',
            'dynamodb:DeleteItem',
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:UpdateItem',
            'dynamodb:UpdateTimeToLive',
        ];

        // The Fargate Task Role needs to perform DynamoDB actions on the Ordered
        // and Unordered tables
        loadBalancedFargateService.taskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({
            resources: [unorderedTable.tableArn, orderedTable.tableArn],
            actions: dynamoActions
        }));


        // Gateway VPC endpoints
        // Allow fargate service tasks to access DynamoDB and S3 without having to
        // go out of NAT, over the internet and back in to Amazon.
        // S3 is required to download docker images referenced in ECR.
        // See https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html
        const dynamoVpcEndpoint = new ec2.GatewayVpcEndpoint(this, 'DynamoVpcEndpoint', {
            service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
            subnets: [{
                subnetType: ec2.SubnetType.PRIVATE
            }],
            vpc: vpc
        });

        new ec2.GatewayVpcEndpoint(this, 'S3VpcEndpoint', {
            service: ec2.GatewayVpcEndpointAwsService.S3,
            subnets: [{
                subnetType: ec2.SubnetType.PRIVATE
            }],
            vpc: vpc
        });

        // The VPC Gateway Endpoint to DynamoDB might as well be restricted to just the Fargate Task Role
        // From https://docs.aws.amazon.com/vpc/latest/userguide/vpc-endpoints-access.html:
        // "Your policy must contain a Principal element. For gateway endpoints only, you cannot limit the
        // principal to a specific IAM role or user. Specify "*" to grant access to all IAM roles and users."
        dynamoVpcEndpoint.addToPolicy(new iam.PolicyStatement({
            resources: [unorderedTable.tableArn, orderedTable.tableArn],
            actions: dynamoActions,
            principals: [new iam.AnyPrincipal()]
        }));


        // Interface VPC endpoints
        // Allow fargate service tasks to access ECR, CloudWatch logs without having to
        // go out of NAT, over the internet and back in to Amazon.
        // Note that fargate tasks do not require VPC endpoints to access ECS itself,
        // see https://docs.aws.amazon.com/AmazonECS/latest/developerguide/vpc-endpoints.html
        const ecrVpcEndpoint = new ec2.InterfaceVpcEndpoint(this, 'EcrVpcEndpoint', {
            vpc: vpc,
            service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
            privateDnsEnabled: true,
            subnets: {
                subnetType: ec2.SubnetType.PRIVATE
            },
            securityGroups: [new ec2.SecurityGroup(this, 'EcrVpcEndpointSecurityGroup', {
                allowAllOutbound: false,
                vpc: vpc
            })],
            // TODO: Add when ApplicationLoadBalancedFargateService supports custom security groups
            // open: false
        });

        const cloudwatchVpcEndpoint = new ec2.InterfaceVpcEndpoint(this, 'CloudWatchVpcEndpoint', {
            vpc: vpc,
            service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
            privateDnsEnabled: true,
            subnets: {
                subnetType: ec2.SubnetType.PRIVATE
            },
            securityGroups: [new ec2.SecurityGroup(this, 'CloudwatchVpcEndpointSecurityGroup', {
                allowAllOutbound: false,
                vpc: vpc,

            })],
            // TODO: Add when ApplicationLoadBalancedFargateService supports custom security groups
            // open: false
        });

        // Security group rules
        // The pubSubSecurityGroup associated with the network interface of each fargate task
        // container must allow egress to the IP address of VPC Gateway Endpoints and to the
        // separate security groups associated with the network interfaces of each VPC Interface
        // Endpoint for Redis, ECR and CloudWatch.
        // Note that pl-6fa54006 is the prefixlist id for com.amazonaws.eu-west-1.dynamodb
        // and pl-6da54004 is the prefixList if for com.amazonaws.eu-west-1.s3
        // which is an alias for a list of IP ranges. Run `aws ec2 describe-prefix-lists` to see them all.

        // TODO: Add when ApplicationLoadBalancedFargateService supports custom security groups
        /*
        pubsubSecurityGroup.connections.allowTo(ec2.Peer.prefixList('pl-6fa54006'),
            ec2.Port.tcp(443), 'Pub Sub Service to DynamoDB');

        pubsubSecurityGroup.connections.allowTo(ec2.Peer.prefixList('pl-6da54004'),
            ec2.Port.tcp(443), 'Pub Sub Service to S3');

        pubsubSecurityGroup.connections.allowTo(redisSecurityGroup,
            ec2.Port.tcp(6379), 'Pub Sub Service to Redis');

        pubsubSecurityGroup.connections.allowTo(ecrVpcEndpoint,
            ec2.Port.tcp(443), 'Pub Sub Service to ECR');

        pubsubSecurityGroup.connections.allowTo(cloudwatchVpcEndpoint,
            ec2.Port.tcp(443), 'Pub Sub Service to CloudWatch');
        */

        // Previously enabled sticky cookies cannot be disabled, so changed durtion to 1 second
        loadBalancedFargateService.targetGroup.enableCookieStickiness(cdk.Duration.seconds(1));
        loadBalancedFargateService.targetGroup.configureHealthCheck({
            port: this.node.tryGetContext('applicationPort').toString(),
            path: '/healthcheck',
            timeout: cdk.Duration.seconds(60), // For Application Load Balancers, the range is 2-60 seconds and the default is 5 seconds
            interval: cdk.Duration.seconds(65), // Must be greater than the timeout
            unhealthyThresholdCount: 3
        });

        // configure load balancer scaling rules
        const scalableTarget = loadBalancedFargateService.service.autoScaleTaskCount({
            minCapacity: this.node.tryGetContext('minScaleContainers'),
            maxCapacity: this.node.tryGetContext('maxScaleContainers'),
        });
        scalableTarget.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: context.get('fargateScalePercentage'),
            scaleInCooldown: cdk.Duration.seconds(10),
            scaleOutCooldown: cdk.Duration.seconds(360),
        });
        scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
            targetUtilizationPercent: context.get('fargateScalePercentage'),
            scaleInCooldown: cdk.Duration.seconds(10),
            scaleOutCooldown: cdk.Duration.seconds(360),
        });

        const domain = context.backendDomainName('state');
        const certificate = certificatemanager.Certificate.fromCertificateArn(this, 'AcmIo', context.certificateArn(domain));

        // create cdn to forward traffic to the ALB
        const distribution = new cloudfront.CloudFrontWebDistribution(this, 'cdnIo', {
            originConfigs: [{
                customOriginSource: {
                    domainName: loadBalancedFargateService.loadBalancer.loadBalancerDnsName,
                    httpPort: this.node.tryGetContext('applicationPort'),
                    originProtocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY
                },
                behaviors: [{
                    isDefaultBehavior: true,
                    minTtl: cdk.Duration.seconds(0),
                    maxTtl: cdk.Duration.seconds(0),
                    defaultTtl: cdk.Duration.seconds(0),
                    forwardedValues: {
                        queryString: true,
                        cookies: {
                            forward: 'all' // tutorful api authentication cookie
                        }
                    },
                    allowedMethods: CloudFrontAllowedMethods.ALL
                }],
                originHeaders: {
                    'X-Tutorful': context.get('headerSecret') // header websocket api uses to check traffic has come from the cdn
                }
            }
            ],
            defaultRootObject: '',
            viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(certificate, {
                aliases: [
                    domain
                ]
            }),
            webACLId: context.get('webAclId'),
        });

        // get the hosted zone
        // Hack alert!
        // Ideally we would use fromHostedZoneName but that requires accountId to be set for the Stack,
        // which then changes the generated templates for ECS service cluster causing it to be replaced,
        // and that is not desirable for production...
        const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZoneIo', {
            zoneName: context.isTestEnvironment() ? 'tful.io': 'tutorful.io',
            hostedZoneId: context.isTestEnvironment() ? 'ZS135B4LAJKQK': 'Z04626673HZLAT9OPMTNS'
        });

        // create DNS record
        new route53.ARecord(this, 'ARecordIo', {
            target: route53.RecordTarget.fromAlias(new route53target.CloudFrontTarget(distribution)),
            zone: hostedZone,
            recordName: domain
        });
    }
}
