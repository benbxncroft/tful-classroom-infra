import cdk = require('@aws-cdk/core');
import s3 = require('@aws-cdk/aws-s3');
import cloudfront = require('@aws-cdk/aws-cloudfront');
import route53 = require('@aws-cdk/aws-route53');
import route53_target = require('@aws-cdk/aws-route53-targets');
import certificatemanager = require('@aws-cdk/aws-certificatemanager');
import iam = require('@aws-cdk/aws-iam');
import { RemovalPolicy } from "@aws-cdk/core";
import { Context } from "./context";
import { CloudFrontAllowedMethods } from "@aws-cdk/aws-cloudfront";
import { BlockPublicAccess } from '@aws-cdk/aws-s3';
import { Effect } from "@aws-cdk/aws-iam";

export class ObjectStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const context = new Context(scope);

        const s3Bucket = new s3.Bucket(this, 'ObjectBucket', {
            // Hack alert!
            // Before we had multiple countries, this stack created the prod bucket named
            // objects.tutorful.co.uk. It would be great if this were now named objects.tutorful.io
            // but it is not possible to rename buckets so we have to ensure this name
            // remains for prod
            bucketName: context.isTestEnvironment() ? context.bucketName('objects') : 'objects.tutorful.co.uk',
            removalPolicy: RemovalPolicy.RETAIN,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            cors: [{
                allowedOrigins:
                    // all country domains for classroom. and app. subdomains
                    context.allDomains('classroom').map(domain => 'https://' + domain).concat(
                    context.allDomains('app').map(domain => 'https://' + domain))
                ,
                allowedMethods: [ s3.HttpMethods.PUT, s3.HttpMethods.GET ],
                allowedHeaders: [
                    'x-amz-content-sha256',
                    'x-amz-acl',
                    'x-amz-meta-lesson-booking-uuid',
                    'x-amz-meta-original-file-name',
                    'content-type',
                    'content-disposition',
                ]
            }]
        });

        const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI');

        // If production then we must keep objects.tutorful.co.uk in parallel with objects.tutorful.io
        // until the classroom has been updated to use the new domain. This section can be removed
        // once that has happened.
        const domain = context.isTestEnvironment() ? context.backendDomainName('objects') : 'objects.tutorful.co.uk';
        const certificate = certificatemanager.Certificate.fromCertificateArn(this, 'Acm', context.certificateArn(domain));

        const distribution = new cloudfront.CloudFrontWebDistribution(this, 'Distribution', {
            originConfigs: [
                {
                    s3OriginSource: {
                        s3BucketSource: s3Bucket,
                        originAccessIdentity: originAccessIdentity
                    },
                    behaviors : [ {
                        isDefaultBehavior: true,
                        allowedMethods: CloudFrontAllowedMethods.ALL,
                        trustedSigners: [context.get('accountId')],
                    } ],
                }
            ],
            viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(certificate, {
                aliases: [
                    domain
                ]
            }),
            webACLId: context.get('webAclId'),
            defaultRootObject: ''
        });

        const cloudfrontResource = [s3Bucket.bucketArn, s3Bucket.arnForObjects('*')];

        // Adding s3 as an origin source for the above distribution adds some unnecessary actions which can't seem to be changed
        // The following policy blocks those default actions
        s3Bucket.addToResourcePolicy(new iam.PolicyStatement({
            actions: [
                "s3:GetBucket*",
                "s3:List*"
            ],
            effect: Effect.DENY,
            resources: cloudfrontResource,
            principals: [new iam.CanonicalUserPrincipal(originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
        }));

        s3Bucket.addToResourcePolicy(new iam.PolicyStatement({
            actions: [
                "s3:PutObject",
            ],
            effect: Effect.ALLOW,
            resources: cloudfrontResource,
            principals: [new iam.CanonicalUserPrincipal(originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
        }));

        const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
            domainName: context.hostedZoneName(domain)
        });

        new route53.ARecord(this, 'ARecord', {
            zone: hostedZone,
            recordName: domain,
            target: route53.RecordTarget.fromAlias(new route53_target.CloudFrontTarget(distribution)),
        });

        if (!context.isTestEnvironment()) {
            const domain = 'objects.tutorful.io';
            const certificate = certificatemanager.Certificate.fromCertificateArn(this, 'AcmIo', context.certificateArn(domain));

            const distribution = new cloudfront.CloudFrontWebDistribution(this, 'DistributionIo', {
                originConfigs: [
                    {
                        s3OriginSource: {
                            s3BucketSource: s3Bucket,
                            originAccessIdentity: originAccessIdentity
                        },
                        behaviors : [ {
                            isDefaultBehavior: true,
                            allowedMethods: CloudFrontAllowedMethods.ALL,
                            trustedSigners: [context.get('accountId')],
                        } ],
                    }
                ],
                viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(certificate, {
                    aliases: [
                        domain
                    ]
                }),
                webACLId: context.get('webAclId'),
                defaultRootObject: ''
            });

            const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZoneIo', {
                zoneName: 'tutorful.io',
                hostedZoneId: 'Z04626673HZLAT9OPMTNS'
            });

            new route53.ARecord(this, 'ARecordIo', {
                zone: hostedZone,
                recordName: domain,
                target: route53.RecordTarget.fromAlias(new route53_target.CloudFrontTarget(distribution)),
            });
        }
    }
}
