import cdk = require('@aws-cdk/core');
import ecr = require('@aws-cdk/aws-ecr');
import { Context } from "./context";

export class PubSubDockerRepoStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const context = new Context(scope);

        // create an image repository for the pubsub image
        new ecr.Repository(this, 'pubsub', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            repositoryName: context.environmentPrefixedName('pubsub'),
            lifecycleRules: [{
                description: 'Keep only the latest two images that have been pushed',
                tagStatus: ecr.TagStatus.ANY,
                maxImageCount: 2
            }]
        });
    }
}