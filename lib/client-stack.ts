import cdk = require('@aws-cdk/core');
import s3 = require('@aws-cdk/aws-s3');
import { RemovalPolicy } from "@aws-cdk/core";
import { Context } from "./context";
import cloudfront = require('@aws-cdk/aws-cloudfront');
import route53 = require('@aws-cdk/aws-route53');
import route53_target = require('@aws-cdk/aws-route53-targets');
import certificatemanager = require('@aws-cdk/aws-certificatemanager');
import iam = require('@aws-cdk/aws-iam');
import { IHostedZone } from '@aws-cdk/aws-route53';

export class ClientStack extends cdk.Stack {
    constructor (scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const context = new Context(scope);
        const domains = context.allDomains('classroom');
        const hostedZones = domains.reduce((obj: { [key: string]: IHostedZone }, domain) => 
            (obj[domain] = route53.HostedZone.fromLookup(this, 'HostedZone-' + domain, { domainName: context.hostedZoneName(domain) }), obj), {} );


        const s3Bucket = new s3.Bucket(this, 'ClientBucket', {
            // Hack alert!
            // Before we had multiple countries, this stack created the prod bucket named
            // classroom.tutorful.co.uk. It would be great if this were now named classroom.tutorful.io
            // but it is not possible to rename buckets so we have to ensure this name
            // remains for prod
            bucketName: context.isTestEnvironment() ? context.bucketName('classroom') : 'classroom.tutorful.co.uk',
            removalPolicy: RemovalPolicy.DESTROY,
        });


        // CloudFront OAI to use to access bucket
        const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI');

        // CloudFront Distribution and DNS alias for each country domain
        for (const domain of domains) {
            const certificate = certificatemanager.Certificate.fromCertificateArn(this, 'Cert-' + domain, context.certificateArn(domain));

            // Hack alert!
            // Long long ago, before the times of international and multiple domains, this stack created
            // a CloudFront distribution named 'Distribution' for app.tutorful.co.uk. Now we have
            // multiple domains and want to create multiple CloudFront distributions, they each need a
            // unique name. However, we cannot change the name of the existing item because that requires
            // CloudFormation to create the new one before destroying the old named one. That works for
            // many types of resources, but not CloudFront distributions as you are prevented from having
            // more than one distribution existing for the same CNAME at any one time.
            // This line makes sure the distribution for app.tutorful.co.uk always keeps the old name.
            const name = domain === 'classroom.tutorful.co.uk' ? 'Distribution': 'CF-' + domain;

            const distribution = new cloudfront.CloudFrontWebDistribution(this, name, {
                originConfigs: [
                    {
                        s3OriginSource: {
                            s3BucketSource: s3Bucket,
                            originAccessIdentity: originAccessIdentity,
                        },
                        behaviors : [ {
                            isDefaultBehavior: true,
                            // https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html#ExpirationDownloadDist
                            defaultTtl: cdk.Duration.days(30),
                            minTtl: cdk.Duration.days(30),
                            maxTtl: cdk.Duration.days(365)
                        }],
                    }
                ],
                viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(certificate, {
                    aliases: [domain]
                }),
                webACLId: context.get('webAclId'),
                errorConfigurations: [{
                    errorCode: 400, // if lesson data argument exceeds s3 max key length
                    responseCode: 200,
                    responsePagePath: '/index.html',
                    errorCachingMinTtl: cdk.Duration.days(30).toSeconds()
                }, {
                    errorCode: 404, // if a url param is passed for app routing and therefore does not match an object in s3
                    responseCode: 200,
                    responsePagePath: '/index.html',
                    errorCachingMinTtl: cdk.Duration.days(30).toSeconds()
                }]
            });

            // Similar hack for existing A record
            // Cannot change the name of the cdk object without deleting the original
            // which would require downtime
            const dnsname = domain === 'classroom.tutorful.co.uk' ? 'ARecord': 'ARecord-' + domain;

            new route53.ARecord(this, dnsname, {
                zone: hostedZones[domain],
                recordName: domain,
                target: route53.RecordTarget.fromAlias(new route53_target.CloudFrontTarget(distribution)),
            });
        }
    }
}
