import type { Request, Response } from 'express'
import type { ErrorResponse, Transaction, TransactionResponse } from '../types/transaction.js'
import { v4 as uuid } from 'uuid'
import { detectFraud } from '../logic/detector.js'
import sendFlaggedTransaction from '../lib/sqs.js'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'

const VALID_TRANSACTION_TYPES = ['withdrawal', 'deposit', 'transfer']
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}))

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
    transaction.timestamp = new Date().toISOString() // overwrite client provided time, otherwise timestamp can be spoofed to avoid fraud detection
    const transactionId = uuid()

    // directly write to DB
    const TRANSACTION_HISTORY_TABLE = process.env.TRANSACTION_HISTORY_TABLE
    if (!TRANSACTION_HISTORY_TABLE) throw new Error("TRANSACTION_HISTORY_TABLE is not set!")

    // check for fraud
    const fraudResult = await detectFraud(transaction)

    await docClient.send(new PutCommand({
      TableName: TRANSACTION_HISTORY_TABLE,
      Item: {
        ...transaction,
        transaction_id: transactionId,
        transaction_sort: `${transaction.timestamp}#${transactionId}`
      }
    }))

    // send to SQS if fraudulent
    if (fraudResult.flagged) {
      await sendFlaggedTransaction({
        ...transaction,
        transaction_id: transactionId,
        reasons: fraudResult.reasons,
        flagged_at: new Date().toISOString()
      })
    }

    res.status(200).json({
      transaction_id: transactionId,
      account_id: transaction.account_id,
      status: fraudResult.flagged ? 'flagged' : 'approved',
      reasons: fraudResult.reasons, // honestly maybe this isn't a good idea LOL, in real environments we shouldn't return this
    })
  } catch (err) {
    console.error(`${err}\nRequest: ${JSON.stringify(req.body, null, 2)}`)
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
