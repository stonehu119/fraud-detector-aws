import type { SQSEvent, SQSBatchResponse } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

interface FlaggedTransactionMessage {
    transaction_id: string
    account_id: string
    amount: number
    transaction_type: string
    location: string
    timestamp: string
    reasons: string[]
    flagged_at: string
}

const FLAGGED_TRANSACTIONS_TABLE_NAME = process.env.FLAGGED_TRANSACTIONS_TABLE
const USERS_TABLE_NAME = process.env.USERS_TABLE
const FROM_ADDRESS = process.env.SES_FROM_ADDRESS

const ses = new SESClient({})
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchResponse['batchItemFailures'] = []

    for (const record of event.Records) {
        try {
            const message = JSON.parse(record.body) as FlaggedTransactionMessage
            console.log(`Processing message ID: ${record.messageId}`)
            
            const putCommand = new PutCommand({
                TableName: FLAGGED_TRANSACTIONS_TABLE_NAME,
                Item: {
                    ...message,
                    flagged_sort: `${message.flagged_at}#${message.transaction_id}`
                }
            })

            await docClient.send(putCommand)

            const account = await docClient.send(
                new GetCommand({ TableName: USERS_TABLE_NAME, Key: { account_id: message.account_id } }),
            )
            const emailAddress = account.Item?.email

            if (emailAddress) {
                const emailCommand = new SendEmailCommand({
                    Source: FROM_ADDRESS,
                    Destination: {
                        ToAddresses: [emailAddress]
                    },
                    Message: {
                        Subject: { Data: 'Suspicious transaction flagged on your account' },
                        Body: {
                            Text: {
                                Data: `A ${message.transaction_type} of $${message.amount} from ${message.location} was flagged. Reasons: ${message.reasons.join(', ')}.`,
                            },
                        },
                    }
                })
                await ses.send(emailCommand)
            } else {
                console.warn(`No email on file for account ${message.account_id}; skipping notification`)
            }
        } catch (err) {
            console.error(`Failed to process message ${record.messageId}`, err)
            batchItemFailures.push({ itemIdentifier: record.messageId })
        }
    }

    return { batchItemFailures }
}
