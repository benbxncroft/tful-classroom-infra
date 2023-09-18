import { Construct, Stack, StackProps, Duration } from "@aws-cdk/core";
import { PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "@aws-cdk/aws-iam";
import { Alarm, ComparisonOperator, Metric } from "@aws-cdk/aws-cloudwatch";
import { CfnCanary } from "@aws-cdk/aws-synthetics";
import { Bucket } from "@aws-cdk/aws-s3";
import { RemovalPolicy } from "@aws-cdk/core";
import { Context } from "./context";

const fs = require('fs');

export class CanaryStack extends Stack {
    constructor (scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const context = new Context(scope);

        const s3Bucket = new Bucket(this, 'CanaryOutputs', {
            removalPolicy: RemovalPolicy.DESTROY,
        });

        s3Bucket.addLifecycleRule({
            enabled: true,
            expiration: Duration.days(7),
            id: 'canaryOutputExpiration',
        });

        // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-synthetics-canary.html#cfn-synthetics-canary-executionrolearn
        const policy = new PolicyDocument({
            statements: [
                new PolicyStatement({
                    resources: ['*'],
                    actions: ['s3:ListAllMyBuckets'],
                }),
                new PolicyStatement({
                    resources: [s3Bucket.arnForObjects('*')],
                    actions: ['s3:PutObject', 's3:GetBucketLocation'],
                }),
                new PolicyStatement({
                    resources: ['*'],
                    actions: ['cloudwatch:PutMetricData'],
                    conditions: {StringEquals: {'cloudwatch:namespace': 'CloudWatchSynthetics'}},
                }),
                new PolicyStatement({
                    resources: ['arn:aws:logs:::*'],
                    actions: ['logs:CreateLogStream', 'logs:CreateLogGroup', 'logs:PutLogEvents'],
                }),
            ],
        });

        const role = new Role(this, 'CanaryRole', {
            assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
            inlinePolicies: {
                canaryPolicy: policy,
            },
        });

        this.makeCanary(context, 'demo', 'classroomDemoCanary.js', s3Bucket, role);
        this.makeCanary(context, 'lesson', 'classroomLessonCanary.js', s3Bucket, role);
    }

    private makeCanary (context: Context, name: string, filename: string, bucket: Bucket, role: Role): void {
        const fileContent: string = fs.readFileSync(__dirname + '/' + filename, "utf-8");
        const script = fileContent.replace('{{url}}', context.allDomains('classroom')[0]);

        new CfnCanary (this, context.environmentPrefixedName(name), {
            artifactS3Location: bucket.s3UrlForObject(),
            code: {
                handler: 'index.handler',
                script
            },
            executionRoleArn: role.roleArn,
            name: context.environmentPrefixedName(name),
            runtimeVersion: "syn-nodejs-puppeteer-3.8",
            schedule: {
                expression: 'cron('+ context.get('canaryCron') +')',
            },
            startCanaryAfterCreation: true
        });

        const metric = new Metric({
            metricName: 'SuccessPercent',
            namespace: 'CloudWatchSynthetics',
            dimensions: { CanaryName: context.environmentPrefixedName(name) },
            statistic: 'avg',
        }).attachTo(this);

        new Alarm(this, context.environmentPrefixedName(name + 'Alarm'), {
            metric,
            evaluationPeriods: 1,
            threshold: 100,
            comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
        });
    }
}
