export type TransactionType = 'withdrawal' | 'deposit' | 'transfer'

export interface Transaction {
  account_id: string
  amount: number
  transaction_type: TransactionType
  location: string
  timestamp: string
}

export type FraudResult = 'approved' | 'flagged'

export interface TransactionResponse {
  transaction_id: string
  account_id: string
  status: FraudResult
  reasons: FraudReason[]
}

export type FraudReason =
  | 'LARGE_WITHDRAWAL'
  | 'GEO_ANOMALY'
  | 'FAILED_LOGIN_ATTEMPTS'

export interface FraudCheckResult {
  flagged: boolean
  reasons: FraudReason[]
}

export interface ErrorResponse {
  error: string
}
