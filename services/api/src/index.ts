import express from 'express'
import type { Request, Response, Application } from 'express'
import dotenv from 'dotenv'

dotenv.config()


const app = express()
app.use(express.json())

app.post('/transactions', (req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

const PORT = process.env.PORT ?? 3000
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`))
