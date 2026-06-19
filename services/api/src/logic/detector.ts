import type { Transaction } from '../types/transaction.ts'

const THRESHOLD = 10000

export async function isFraud(transaction: Transaction): Promise<boolean> {
  if (transaction.amount >= THRESHOLD) {
    return true
  }

  // check for different geographic regions within short time

  // check for multiple failed logins beforehand

  // temp time delay to simulate long processing time
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  await delay(5000)

  return false
}
