import * as cdk from 'aws-cdk-lib/core'
import { Construct } from 'constructs'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as path from 'path'
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';

import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns'

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const vpc = new ec2.Vpc(this, 'fraud-detection-vpc-cdk', {
      maxAzs: 2,
      vpcName: 'fraud-detection-vpc-cdk',
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC }
      ]
    })

    const cluster = new ecs.Cluster(this, 'fraud-detection-cluster-cdk', {
      vpc: vpc,
      clusterName: 'fraud-detection-cluster-cdk'
    })

    const flaggedMsgQueue = new sqs.Queue(this, 'flagged-transactions-cdk', {
      queueName: 'flagged-transactions-cdk',
      visibilityTimeout: cdk.Duration.seconds(90),
    })

    const apiService = new ApplicationLoadBalancedFargateService(this, 'fraud-detection-service-cdk', {
      serviceName: 'fraud-detection-service-cdk',
      cluster: cluster,
      taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      healthCheckGracePeriod: cdk.Duration.seconds(30),
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(path.join(__dirname, "../../services/api/")),
        containerPort: 3000,
        environment: {
          AWS_REGION: this.region,
          QUEUE_URL: flaggedMsgQueue.queueUrl
        }
      },
      cpu: 256,
      memoryLimitMiB: 512,
      publicLoadBalancer: true,
      loadBalancerName: 'fraud-detection-alb-cdk',
      assignPublicIp: true,
    })

    apiService.targetGroup.configureHealthCheck({ path: "/health" })
    flaggedMsgQueue.grantSendMessages(apiService.taskDefinition.taskRole)

    const transactionHistoryTable = new dynamodb.Table(this, 'TransactionHistoryTable', {
      tableName: 'transactions-cdk',
      partitionKey: { name: 'account_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'transaction_sort', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    transactionHistoryTable.grantReadWriteData(apiService.taskDefinition.taskRole)

    apiService.taskDefinition.defaultContainer?.addEnvironment(
      'TRANSACTION_HISTORY_TABLE',
      transactionHistoryTable.tableName,
    )

    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'users-cdk',
      partitionKey: { name: 'account_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    usersTable.grantReadData(apiService.taskDefinition.taskRole)

    apiService.taskDefinition.defaultContainer?.addEnvironment(
      'USERS_TABLE',
      usersTable.tableName
    )

    const failedLoginsTable = new dynamodb.Table(this, 'FailedLoginsTable', {
      tableName: 'failed-logins-cdk',
      partitionKey: { name: 'account_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'attempt_sort', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    failedLoginsTable.grantReadWriteData(apiService.taskDefinition.taskRole)

    apiService.taskDefinition.defaultContainer?.addEnvironment(
      'FAILED_LOGINS_TABLE',
      failedLoginsTable.tableName
    )

    const flaggedTable = new dynamodb.Table(this, 'FlaggedTransactionsTable', {
      tableName: 'flagged-transactions-cdk',
      partitionKey: { name: 'account_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'flagged_sort', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const lambdaRootDir = path.join(__dirname, '../../services/lambda/')
    const sesFromAddress = 'stonehu9000@gmail.com';
    const notifierFn = new NodejsFunction(this, 'fraud-detector-lambda-cdk', {
      functionName: 'fraud-detector-lambda-cdk',
      entry: path.join(lambdaRootDir, 'src', 'index.ts'),
      projectRoot: lambdaRootDir,
      depsLockFilePath: path.join(lambdaRootDir, 'package-lock.json'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        FLAGGED_TRANSACTIONS_TABLE: flaggedTable.tableName,
        USERS_TABLE: usersTable.tableName,
        SES_FROM_ADDRESS: sesFromAddress,
      },
    })

    notifierFn.addEventSource(new SqsEventSource(flaggedMsgQueue, {
      reportBatchItemFailures: true,
    }))

    flaggedTable.grantWriteData(notifierFn)
    usersTable.grantReadData(notifierFn)

    // idk how else to add permissions for the Lambda to trigger SES besides manually
    notifierFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: [
        `arn:aws:ses:${this.region}:${this.account}:identity/${sesFromAddress}`,
      ],
    }))

  }
}
