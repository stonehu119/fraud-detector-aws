import * as cdk from 'aws-cdk-lib/core'
import { Construct } from 'constructs'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as path from 'path'
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
    flaggedMsgQueue.grantSendMessages(apiService.taskDefinition.taskRole);
  }
}
