import 'dotenv/config'
import express from 'express'
import { handleTransaction } from './routes/transactions.js'

const PORT = process.env.PORT ?? 3000

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
})

app.post('/transactions', handleTransaction)

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`))
