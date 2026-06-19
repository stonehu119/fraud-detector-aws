export interface Transaction {
  account_id: string
  amount: number
  transaction_type: 'withdrawal' | 'deposit' | 'transfer'
  location: string
  timestamp: string
}

export type FraudResult = 'approved' | 'flagged'

export interface TransactionResponse {
  transaction_id: string
  account_id: string
  status: FraudResult
  reason?: string
}

export interface ErrorResponse {
  error: string
}
