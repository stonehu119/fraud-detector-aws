
## Fraud Detection Logic

Every transaction is evaluated synchronously against three rules before the API responds. A transaction is **approved** if it trips none of them and **flagged** if it trips one or more. Flagged transactions are published to an SQS queue, which is listened to by a Lambda that writes the record to DynamoDB and sends an email via SES. The API returns its response immediately after successfully pushing the message to the SQS queue, without waiting for any downstream processing. All three rules run inside a single `detectFraud` function, which returns the set of reasons that fired.

**Rule 1 — Large amount.** A transaction whose `amount` is at or above the **$10,000** threshold is flagged with `LARGE_WITHDRAWAL`. This is a direct threshold check on the amount. The flag is named for withdrawals, but this rule can actually apply to any of the 3 transaction types.

**Rule 2 — Geographic anomaly.** When a transaction arrives, the service looks up the account's most recent previous transaction. If that previous transaction occurred at a **different location** and **within the last 3 hours**, the new transaction is flagged with `GEO_ANOMALY`. The first transaction for an account has no prior transaction to compare against so is never flagged by this rule. The timestamp used for the comparison is the server's receive time, not the client-supplied value, so malicious client cannot evade the rule by sending a falsified timestamp.

**Rule 3 — Repeated failed logins.** The `/login` endpoint records each failed attempt (a real account with the wrong password) to a dedicated DynamoDB table, stamped with the server time. When a transaction arrives, the service counts that account's failed logins within the **last 15 minutes**; **5 or more** flags the transaction with `FAILED_LOGIN_ATTEMPTS`. Failed-login records expire automatically via a DynamoDB TTL.
