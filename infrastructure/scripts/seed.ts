import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'

const tableName = 'users-cdk'
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const users = [
  { account_id: 'StoneHu', email: 'stonehu9000@gmail.com' },
];

async function seed() {
  for (const user of users) {
    await docClient.send(new PutCommand({ TableName: tableName, Item: user }));
    console.log(`seeded ${user.account_id}`);
  }
  console.log(`done — ${users.length} rows`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
