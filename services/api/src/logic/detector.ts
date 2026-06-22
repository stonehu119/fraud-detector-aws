import type { Transaction, FraudCheckResult, FraudReason } from '../types/transaction.js'

const THRESHOLD = 10000

export async function detectFraud(transaction: Transaction): Promise<FraudCheckResult> {
  const reasons: FraudReason[] = []

  if (transaction.amount >= THRESHOLD) {
    reasons.push('LARGE_WITHDRAWAL')
  }

  // check for different geographic regions within short time

  // check for multiple failed logins beforehand

  // temp time delay to simulate long processing time
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  await delay(2000)

  return {
    flagged: reasons.length > 0,
    reasons,
  }
}
