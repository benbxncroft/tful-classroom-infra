import { IConstruct } from "@aws-cdk/core";
import { DomainData } from "./domain-data";

/**
 * A helper class for accessing / generating environment specific context values
 */
export class Context {
    private scope: IConstruct;

    constructor (scope: IConstruct) {
        this.scope = scope;
    }

    /**
     * Return the value of the given key from the correct prod / dev section.
     */
    public get (key: string): any {
        const section = this.isTestEnvironment() ? 'dev' : 'prod';
        return this.scope.node.tryGetContext(section)[key];
    }

    /**
     * Are we building infrastructure for production or test?
     */
    public isTestEnvironment (): boolean {
        return !!this.scope.node.tryGetContext('environment');
    }

    /**
     * What is the name of the test environment we are building
     */
    public testEnvironmentName (): string {
        return this.scope.node.tryGetContext('environment') || '';
    }

    /**
     * Generate a unique name
     * 
     * For production environments, resource names are as supplied.
     * For test environments, resource names are prefixed with the test environment name.
     * 
     * @param join Optional string to insert when creating names for test environments
     */
    public environmentPrefixedName (name: string, join: string = ''): string {
        if (this.isTestEnvironment()) {
            return this.testEnvironmentName() + join + name;
        }

        return name;
    }

    /**
     * Generate a backend domain name.
     * 
     * For subdomain 'app'...
     * 
     *  - For production with backend suffix 'tutorful.io' the output would be 'app.tutorful.io'
     * 
     *  - For test environment named 'myenv' with backend suffix 'tful.io' the output would
     * be 'myenv-app.tful.io'
     */
    public backendDomainName (subdomain: string): string {
        return this.environmentPrefixedName(subdomain, '-') + '.' + this.get('backendSuffix');
    }

    /**
     * Generate an S3 bucket name.
     * 
     * This is currently the same logic as backend domain name as S3 buckets must have unique
     * names globally (well, in a region at least) so should be like a domain name we own.
     */
    public bucketName (name: string): string {
        return this.backendDomainName(name);
    }

    /**
     * Return the environment specific fqdn for the given domain and subdomain.
     *
     * For prod like domains (tutorful.co.uk, tutorful.ie etc) and subdomain 'bob',
     * returns bob.tutorful.co.uk, bob.tutorful.ie etc.
     * 
     * For test like domains (uk.tful.io, ie.tful.io etc), environment name 'staging' and
     * subdomain 'bob', returns staging-bob-uk.tful.io, staging-bob-ie.tful.io etc
     */
    public fullDomainName(domain: string, subdomain: string | undefined = undefined): string {
        if (this.isTestEnvironment()) {
            if (subdomain) {
                return `${this.testEnvironmentName()}-${subdomain}-${domain}`;
            } else {
                return `${this.testEnvironmentName()}-${domain}`;
            }
        }

        if (subdomain) {
            return `${subdomain}.${domain}`;
        } else {
            return domain;
        }
    }

    /**
     * Get root domain from a given fqdn (the reverse of fullDomainName method).
     */
     public rootDomain (domain: string): string {
        const domains = this.get('domains') as { [key: string]: string };

        if (domain in domains) {
            return domain;
        }

        if (this.isTestEnvironment()) {
            domain = domain.substring(domain.lastIndexOf('-') + 1);
            if (domain in domains) {
                return domain;
            }
        } else {
            domain = domain.substring(domain.indexOf('.') + 1);
            if (domain in domains) {
                return domain;
            }
        }

        throw new Error('Unable to determine root domain for ' + domain);
    }

    /**
     * Return an array of all country specific domain names for the given subdomain.
     *
     * For prod like domains (tutorful.co.uk, tutorful.ie etc) and subdomain 'bob',
     * returns bob.tutorful.co.uk, bob.tutorful.ie etc.
     * 
     * For test like domains (uk.tful.io, ie.tful.io etc), environment name 'staging' and
     * subdomain 'bob', returns staging-bob-uk.tful.io, staging-bob-ie.tful.io etc
     */
    public allDomains (subdomain: string | undefined = undefined): string[] {
        const domains = Object.keys(this.get('domains') as { [key: string]: string }) as string[];
        return domains.map(domain => this.fullDomainName(domain, subdomain));
    }

    /**
     * Get data specific to the domain
     */
     public domainData (domain: string): DomainData {
        const domains = this.get('domains') as { [key: string]: DomainData };
        return domains[this.rootDomain(domain)];
    }

    /**
     * Get the name of the Route 53 hosted zone in which a domain record should be added.
     * 
     * For prod like domains (tutorful.co.uk, tutorful.ie etc) we have to split and take
     * off the subdomain.
     * 
     * For test like domains (staging-uk.tful.io, review-ie.tful.io etc) this is same
     * as the backend suffix.
     */
     public hostedZoneName (domain: string): string {
        const backend = this.get('backendSuffix');

        if (this.isTestEnvironment()) {
            return backend;
        }

        if (domain.substring(domain.length - backend.length) === backend) {
            return backend;
        }

        return this.rootDomain(domain);
    }

    /**
     * Get the ARN for the us-east-1 ACM certificate to use for CloudFront distributions
     * for the given domain.
     */
     public certificateArn (domain: string): string {
        if (this.isTestEnvironment()) {
            return this.get('acmArn');
        }

        const backend = this.get('backendSuffix');
        if (domain.substring(domain.length - backend.length) === backend) {
            return this.get('acmArn');
        }

        const arn = this.domainData(domain).acmArn;
        if (arn) {
            return arn;
        }

        throw new Error('Unable to find certificate arn for domain ' + domain);
    }
}
