import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'

// created once at module load, reused across every request
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const USERS_TABLE = process.env.USERS_TABLE
const FAILED_LOGINS_TABLE = process.env.FAILED_LOGINS_TABLE
const FAILED_LOGIN_TTL_SECONDS = 60 * 60

interface LoginRequest {
  account_id: string
  password: string
}

export async function handleLogin(req: Request, res: Response): Promise<void> {
  try {
    if (!USERS_TABLE || !FAILED_LOGINS_TABLE) {
      throw new Error('USERS_TABLE or FAILED_LOGINS_TABLE is not set')
    }

    const body = req.body as Partial<LoginRequest>
    const validationError = validateLogin(body)
    if (validationError) {
      res.status(400).json({ error: validationError })
      return
    }
    const { account_id, password } = body as LoginRequest

    const user = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { account_id },
    }))

    const passwordHash = user.Item?.password as string | undefined
    const passwordValid = passwordHash ? await bcrypt.compare(password, passwordHash) : false

    if (!passwordValid) {
      if (user.Item) {
        const failedAt = new Date().toISOString()
        await docClient.send(new PutCommand({
          TableName: FAILED_LOGINS_TABLE,
          Item: {
            account_id,
            attempt_sort: `${failedAt}#${uuid()}`,
            failed_at: failedAt,
            ttl: Math.floor(Date.now() / 1000) + FAILED_LOGIN_TTL_SECONDS,
          },
        }))
      }
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    res.status(200).json({ account_id })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

function validateLogin(body: Partial<LoginRequest>): string | null {
  if (!body.account_id || typeof body.account_id !== 'string') {
    return 'account_id is required and must be a string'
  }
  if (!body.password || typeof body.password !== 'string') {
    return 'password is required and must be a string'
  }
  return null
}
