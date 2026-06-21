import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import type { Transaction, FraudReason, TransactionType } from "../types/transaction.js"

const sqs = new SQSClient({})

export interface FlaggedTransactionMessage {
    transaction_id: string
    account_id: string
    amount: number
    transaction_type: TransactionType
    location: string
    timestamp: string
    reasons: FraudReason[]
    flagged_at: string
}

export default async function sendFlaggedTransaction(
    message: FlaggedTransactionMessage
): Promise<void> {
    const QUEUE_URL = process.env.QUEUE_URL
    if (!QUEUE_URL) {
        throw new Error("QUEUE_URL is not set")
    }

    await sqs.send(
        new SendMessageCommand({
            QueueUrl: QUEUE_URL,
            MessageBody: JSON.stringify(message)
        })
    )
}
