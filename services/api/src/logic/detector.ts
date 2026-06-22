import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import type { Transaction, FraudCheckResult, FraudReason } from '../types/transaction.js'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'

const THRESHOLD = 10000
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export async function detectFraud(transaction: Transaction): Promise<FraudCheckResult> {
  const reasons: FraudReason[] = []

  if (transaction.amount >= THRESHOLD) {
    reasons.push('LARGE_WITHDRAWAL')
  }

  // check for different geographic regions within short time
  const TRANSACTION_HISTORY_TABLE = process.env.TRANSACTION_HISTORY_TABLE
  if (!TRANSACTION_HISTORY_TABLE) throw new Error("TRANSACTION_HISTORY_TABLE is not set!")

  const prevTransactions = await docClient.send(new QueryCommand({
    TableName: TRANSACTION_HISTORY_TABLE,
    KeyConditionExpression: 'account_id = :acct',
    ExpressionAttributeValues: { ':acct': transaction.account_id },
    ScanIndexForward: false,
    Limit: 1,
  }))

  const mostRecentTransaction = prevTransactions.Items?.[0] as Transaction
  if (mostRecentTransaction) {
    const differenceInMs: number = new Date().getTime() - new Date(mostRecentTransaction.timestamp).getTime()
    const THREE_HOURS_MS = 1000 * 60 * 60 * 3
    if (differenceInMs < THREE_HOURS_MS && mostRecentTransaction.location !== transaction.location) {
      reasons.push('GEO_ANOMALY')
    }
  }

  // check for multiple failed logins beforehand

  return {
    flagged: reasons.length > 0,
    reasons,
  }
}
