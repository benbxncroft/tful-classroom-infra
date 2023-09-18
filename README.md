# Classroom Infrastructure

Code for managing classroom infrastructure on AWS using CDK

# Contents
[Getting Started](#getting-started)
[How to use](#how-to-use)
[Testing](#testing)
[Monitoring](#monitoring)

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### AWS WAF (Web Application Firewall)

We use WAF to restrict HTTP access to CloudFront distributions created by the CDK stacks in this repo when they are created in the tutorful-dev AWS account. Only whitelisted IP addresses can access the CloudFront distributions. This allows us to restrict access to within the Tutorful office and home IP addresses of employees, rather than everyone on the internet being able to see our work-in-progress websites.

To modify the whitelisted IP addresses:

1. Login to the tutorful-dev AWS console using your username and password
2. Go to https://console.aws.amazon.com/wafv2/home#/webacls
3. On the left bar click on *Switch to AWS WAF Classic*
4. On the left bar click on *IP addresses*
5. Click on `tutorful-ips`
6. Add or remove IP addresses. Addresses are in CIDR form, so to add a single IP (rather than a range) enter the IP address with /32 on the end.

### Prerequisites

- [Homebrew](https://docs.brew.sh/Installation)
- Node (>= 10.3.0) & npm (via nvm) `brew install nvm`
- Python (bundled with MacOS)

### Installing

Instructions are from the [AWS CDK installation guide](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html#getting_started_install)

#### Install dependencies

```
npm install
```

#### Install AWS CLI

```
brew install awscli
```

#### Configure a default AWS profile

```
aws configure
```

- Generate an access key from the [AWS console](https://console.aws.amazon.com/iam/home?region=eu-west-1#/security_credentials)
- Set your `Access Key ID` and `Secret Access Keys` from the newly created access key in the console
- Set the `Default region name` as `eu-west-1`
- Set the `Default output format` as `json`

#### Deploy CDK toolkit

When using CDK for the first time in an account, you need to deploy the CDK toolkit stack into the AWS environment, where the environment name is the account id and region (eg 123456789/eu-west-1)

```
npx cdk bootstrap <account>/<region>
``` 

## How to use

### New environment/domain setup

1. Register domain (new hosted zone)
1. Create [SSL certificate in us-east-1](https://console.aws.amazon.com/acm/home?region=us-east-1)
1. Create CNAME record in route53 (click the button at the end of the ACM setup)  

### Deployment

The stack name will be dynamically generated from an environment variable. This allows us to create multiple versions of the same stack within the same region/account (eg, test1, test2 etc). 

Only dev accounts should be deployed to directly from the CLI.  

Stacks need to be deployed by name.  

The application code that runs on the infrastructure .

#### PubSub 

The infrastructure deploys with a dummy data docker image so that the fargate service starts. The dummy images should then be replaced via an aws cli service update command with the correct pubsub service docker image.

It should be deployed in the following order:

```
npx cdk deploy test1Repo -c environment=test1
ENV=test1 ./deploy-test-image.sh
npx cdk deploy test1PubSub -c environment=test1
```

Any [context value](https://docs.aws.amazon.com/cdk/latest/guide/context.html) can be overridden via the cli. Dev deployments have a default value for everything apart from `environment`, which is always required.

Pubsub docker image update steps:

```
# Example dev settings:
#
# AWS_ACCOUNT_ID=744945563720  
# AWS_REGION=eu-west-1  
# ENV=test1

docker build -t <AWS_ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com/ENVpubsub:<GIT_COMMIT_HASH> -t <AWS_ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com/<ENV>pubsub:latest .

docker push <AWS_ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com/<ENV>pubsub

aws ecs update-service --service <ENV>PubSubService --cluster <ENV>PubSubCluster --force-new-deployment
```

#### Client

```
npx cdk deploy test1Client -c environment=test1
```

### Destroying

```
npx cdk destroy  -c environment=test1 --force
```

Any running stacks can also be managed via the cloudformation sections of the AWS console.

### Other Commands

For a list of all commands:

```
npx cdk --help
```

## Testing

All logic should have unit tests.

To run the test suite:

```
npm run test
```

## Monitoring

AWS metrics are sent to datadog.

### Dashboard
* Keep relevant metrics visible
* [Main dashboard](https://app.datadoghq.com/dashboard/28a-zke-pun/online-classroom)

### Alerts
* Automate alerts for any [AWS quotas](https://docs.aws.amazon.com/general/latest/gr/aws_service_limits.html)
* Automate alerts for any performance problems (eg, 100% memory/cpu/etc)
* Set warnings when a limit is being approached
* Set alerts to anticipate that problems _might_ occur wherever possible - not just that they have occured
* Include a description with alerts with a clear description of what it means and what action is required to recover

### Synthetics
* Every 10 mins a browser test is run to check that the application is running in production.
