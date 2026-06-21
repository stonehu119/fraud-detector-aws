import type { Request, Response } from 'express'
import type { ErrorResponse, Transaction, TransactionResponse } from '../types/transaction.js'
import { v4 as uuid } from 'uuid'
import { detectFraud } from '../logic/detector.js'

const VALID_TRANSACTION_TYPES = ['withdrawal', 'deposit', 'transfer']

export async function handleTransaction(req: Request, res: Response<TransactionResponse | ErrorResponse>): Promise<void> {
  try {
    const body = req.body as Partial<Transaction>

    // validate request
    const validationError = validateTransaction(body)
    if (validationError) {
      res.status(400).json({ error: validationError })
      return
    }
    const transaction = body as Transaction

    // check for fraud
    const fraudResult = await detectFraud(transaction)
    res.status(200).json({
      transaction_id: uuid(),
      account_id: transaction.account_id,
      status: fraudResult.flagged ? 'flagged' : 'approved',
      reasons: fraudResult.reasons,
    })
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
}


function validateTransaction(body: Partial<Transaction>): string | null {
  if (!body.account_id || typeof body.account_id !== 'string') {
    return 'account_id is required and must be a string'
  }
  if (body.amount === undefined || typeof body.amount !== 'number') {
    return 'amount is required and must be a number'
  }
  if (body.amount <= 0) {
    return 'amount must be greater than 0'
  }
  if (!body.transaction_type || !VALID_TRANSACTION_TYPES.includes(body.transaction_type)) {
    return 'transaction_type must be one of: withdrawal, deposit, transfer'
  }
  if (!body.location || typeof body.location !== 'string') {
    return 'location is required and must be a string'
  }
  if (!body.timestamp || isNaN(Date.parse(body.timestamp))) {
    return 'timestamp is required and must be a valid ISO date string'
  }
  return null
}
