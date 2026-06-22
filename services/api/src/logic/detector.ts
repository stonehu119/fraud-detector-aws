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

  // check for multiple failed logins
  const FAILED_LOGINS_TABLE = process.env.FAILED_LOGINS_TABLE
  if (!FAILED_LOGINS_TABLE) throw new Error('FAILED_LOGINS_TABLE is not set!')

  const FAILED_LOGIN_WINDOW_MS = 1000 * 60 * 15 // 15 minutes
  const FAILED_LOGIN_THRESHOLD = 5
  const windowStart = new Date(new Date(transaction.timestamp).getTime() - FAILED_LOGIN_WINDOW_MS).toISOString()

  const recentFailures = await docClient.send(new QueryCommand({
    TableName: FAILED_LOGINS_TABLE,
    KeyConditionExpression: 'account_id = :acct AND attempt_sort >= :windowStart',
    ExpressionAttributeValues: {
      ':acct': transaction.account_id,
      ':windowStart': windowStart,
    },
    Select: 'COUNT',
  }))
  console.warn(recentFailures.Count)

  if ((recentFailures.Count ?? 0) >= FAILED_LOGIN_THRESHOLD) {
    reasons.push('FAILED_LOGIN_ATTEMPTS')
  }

  return {
    flagged: reasons.length > 0,
    reasons,
  }
}
