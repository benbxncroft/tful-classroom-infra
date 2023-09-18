#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { Context } from "./../lib/context";
import { PubSubDockerRepoStack } from "../lib/pub-sub-docker-repo-stack";
import { PubSubStack } from "../lib/pub-sub-stack";
import { ClientStack } from "../lib/client-stack";
import { ObjectStack } from "../lib/object-stack";
import { CanaryStack } from "../lib/canary-stack";

const app = new cdk.App();
const context = new Context(app);

/**
 * PUB SUB SERVICE
 */
new PubSubDockerRepoStack(app, context.environmentPrefixedName('Repo'), {
    tags: {
        stack: context.environmentPrefixedName('PubSubDockerRepo')
    },
    env: {
        account: context.get('accountId'),
        region: app.node.tryGetContext('region')
    }
});

new PubSubStack(app, context.environmentPrefixedName('PubSub'), {
    tags: {
        stack: context.environmentPrefixedName('PubSub')
    },
    env: {
        region: app.node.tryGetContext('region')
    }
});

new ClientStack(app, context.environmentPrefixedName('Client'), {
    tags: {
        stack: context.environmentPrefixedName('Client')
    },
    env: {
        account: context.get('accountId'),
        region: app.node.tryGetContext('region')
    }
});

new ObjectStack(app, context.environmentPrefixedName('Object'), {
    tags: {
        stack: context.environmentPrefixedName('Object')
    },
    env: {
        account: context.get('accountId'),
        region: app.node.tryGetContext('region')
    }
});

new CanaryStack(app, context.environmentPrefixedName('Canary'), {
    tags: {
        stack: context.environmentPrefixedName('Canary')
    },
    env: {
        account: context.get('accountId'),
        region: app.node.tryGetContext('region')
    }
});
