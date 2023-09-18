import { Context } from "../lib/context";
import {App, Construct, IConstruct} from "@aws-cdk/core";

let mockConstruct: IConstruct;

beforeEach(() => {
    mockConstruct = new Construct(new App(), 'Construct');

    mockConstruct.node.setContext('dev', {
        domains: {
            "uk.tful.io": "",
            "fr.tful.io": "",
            "ie.tful.io": ""},
        backendSuffix: "tful.io",
        acmArn: "abc"
    });

    mockConstruct.node.setContext('prod', {
        domains: {
            "tutorful.co.uk": { },
            "tutorful.fr": { acmArn: "x2" },
            "tutorful.ie": { acmArn: "x3" }
        },
        backendSuffix: "tutorful.io"
    });
});

describe('get',() => {
    test('test environment, returns key from dev section', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.get('backendSuffix')).toEqual('tful.io');
    });

    test('prod environment, returns key from prod section', () => {
        const context = new Context(mockConstruct);
        expect(context.get('backendSuffix')).toEqual('tutorful.io');
    });
});

describe('isTestEnvironment',() => {
    test('test environment, returns true', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.isTestEnvironment()).toBeTruthy();
    });

    test('prod environment, returns false', () => {
        const context = new Context(mockConstruct);
        expect(context.isTestEnvironment()).toBeFalsy();
    });
});

describe('testEnvironmentName',() => {
    test('test environment, returns name of the environment', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.testEnvironmentName()).toBe('staging');
    });

    test('prod environment, returns empty', () => {
        const context = new Context(mockConstruct);
        expect(context.testEnvironmentName()).toBe('');
    });
});

describe('environmentPrefixedName', () => {

    test('test environment, name is prefixed', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.environmentPrefixedName('S3Bucket')).toEqual('stagingS3Bucket');
    });

    test('test environment and joiner, name is prefixed with the joiner', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.environmentPrefixedName('S3Bucket', '-')).toEqual('staging-S3Bucket');
    });

    test('prod environment, name is not prefixed', () => {
        const context = new Context(mockConstruct);
        expect(context.environmentPrefixedName('S3Bucket')).toEqual('S3Bucket');
    });

    test('prod environment and joiner, name is not prefixed', () => {
        const context = new Context(mockConstruct);
        expect(context.environmentPrefixedName('S3Bucket', '-')).toEqual('S3Bucket');
    });
});

describe('backendDomainName',() => {
    test('test environment, returns environment prefixed and dev backend suffixed name', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.backendDomainName('Mys3bucket')).toEqual('staging-Mys3bucket.tful.io');
    });

    test('prod environment, returns prod backend suffixed name', () => {
        const context = new Context(mockConstruct);
        expect(context.backendDomainName('Mys3bucket')).toEqual('Mys3bucket.tutorful.io');
    });
});

describe('bucketName',() => {
    test('test environment, returns environment prefixed and dev backend suffixed name', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.bucketName('Mys3bucket')).toEqual('staging-Mys3bucket.tful.io');
    });

    test('prod environment, returns prod backend suffixed name', () => {
        const context = new Context(mockConstruct);
        expect(context.bucketName('Mys3bucket')).toEqual('Mys3bucket.tutorful.io');
    });
});

describe('hostedZoneName',() => {
    test('test environment, returns backend suffix', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.hostedZoneName('staging-app-uk.tful.io')).toEqual('tful.io');
    });

    test('prod environment and prod domain, returns the domain', () => {
        const context = new Context(mockConstruct);
        expect(context.hostedZoneName('tutorful.ie')).toEqual('tutorful.ie');
    });

    test('prod environment and subdomain domain, returns the root of the domain', () => {
        const context = new Context(mockConstruct);
        expect(context.hostedZoneName('app.tutorful.fr')).toEqual('tutorful.fr');
    });

    test('prod environment and backend domain, returns the domain', () => {
        const context = new Context(mockConstruct);
        expect(context.hostedZoneName('tutorful.io')).toEqual('tutorful.io');
    });

    test('prod environment and subdomain of backend domain, returns the backend domain', () => {
        const context = new Context(mockConstruct);
        expect(context.hostedZoneName('api.tutorful.io')).toEqual('tutorful.io');
    });
});

describe('fullDomainName',() => {
    test('test environment without subdomain, prefix with environment name', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.fullDomainName('uk.tful.io')).toEqual('staging-uk.tful.io');
    });

    test('test environment with subdomain, prefix with environment name', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.fullDomainName('uk.tful.io', 'app')).toEqual('staging-app-uk.tful.io');
    });

    test('prod environment without subdomain, just the domain', () => {
        const context = new Context(mockConstruct);
        expect(context.fullDomainName('tutorful.co.uk')).toEqual('tutorful.co.uk');
    });

    test('prod environment with subdomain, proper subdomain', () => {
        const context = new Context(mockConstruct);
        expect(context.fullDomainName('tutorful.co.uk', 'app')).toEqual('app.tutorful.co.uk');
    });
});

describe('rootDomain',() => {
    test('test environment without subdomain', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.rootDomain('staging-uk.tful.io')).toEqual('uk.tful.io');
    });

    test('test environment with subdomain', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.rootDomain('statging-app-uk.tful.io')).toEqual('uk.tful.io');
    });

    test('prod environment without subdomain', () => {
        const context = new Context(mockConstruct);
        expect(context.rootDomain('tutorful.co.uk')).toEqual('tutorful.co.uk');
    });

    test('prod environment with subdomain', () => {
        const context = new Context(mockConstruct);
        expect(context.rootDomain('app.tutorful.co.uk')).toEqual('tutorful.co.uk');
    });

    test('unknown domain, exception', () => {
        const context = new Context(mockConstruct);
        expect(() => context.rootDomain('app.tutorful.com')).toThrow();
    });
});

describe('allDomains',() => {
    test('test environment, list of environment prefixed subdomains for each test country domain', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.allDomains('app')).toEqual(['staging-app-uk.tful.io', 'staging-app-fr.tful.io', 'staging-app-ie.tful.io']);
    });

    test('prod environment, list of subdomains for each prod country domain', () => {
        const context = new Context(mockConstruct);
        expect(context.allDomains('app')).toEqual(['app.tutorful.co.uk', 'app.tutorful.fr', 'app.tutorful.ie']);
    });
});


describe('certificateArn',() => {
    test('test environment and root domain, returns arn', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.certificateArn('staging-uk.tful.io')).toEqual('abc');
    });

    test('test environment and root domain, returns arn', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.certificateArn('staging-app-fr.tful.io')).toEqual('abc');
    });

    test('prod environment and root domain, returns the arn', () => {
        const context = new Context(mockConstruct);
        expect(context.certificateArn('tutorful.ie')).toEqual('x3');
    });

    test('prod environment and subdomain domain, returns the arn of the root domain', () => {
        const context = new Context(mockConstruct);
        expect(context.certificateArn('app.tutorful.fr')).toEqual('x2');
    });

    test('unknown domain, exception', () => {
        const context = new Context(mockConstruct);
        expect(() => context.certificateArn('app.tutorful.co.uk')).toThrow();
    });
});

describe('domainData',() => {
    test('test environment', () => {
        mockConstruct.node.setContext('environment', 'staging');
        const context = new Context(mockConstruct);
        expect(context.domainData('staging-uk.tful.io').acmArn).toBeUndefined();
    });

    test('prod environment', () => {
        const context = new Context(mockConstruct);
        expect(context.domainData('app.tutorful.ie').acmArn).toEqual('x3');
    });
});
