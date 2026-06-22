# Cloud Engineering Technical Assessment
Project created for Brainridge Consulting.
Deployment instructions and API endpoints are documented below, and
application logic as well as architecture diagrams are listed within the `documentation` folder.

> [!NOTE]
> There are some deliberate simplifications and known gaps in this project that would not fly in a real production environment. I've included a brief "Notes" section at the end of this README to discuss them in more detail. Please read them, thanks 🙏

## Deployment

### Prerequisites

- An AWS account with credentials configured for the CLI/SDK (CDK uses the same credential chain).
- Docker running locally — CDK builds the API container image as part of the deploy.
- Node.js and the AWS CDK CLI installed.
- A **verified Amazon SES email identity**. SES starts in sandbox mode, which only delivers to verified addresses, so verify the address you'll use as both sender and recipient in the SES console first. This step is manual and intentionally lives outside the CDK stack.

### Steps

1. Install dependencies in the infrastructure and Lambda projects (the API image installs its own dependencies inside Docker during the deploy):

   ```bash
   cd infrastructure && npm install
   cd ../services/lambda && npm install
   ```

2. Bootstrap CDK once per account/region (provisions the assets bucket and roles CDK needs):

   ```bash
   cd infrastructure
   cdk bootstrap
   ```

3. Deploy the stack:

   ```bash
   cdk deploy
   ```

   This provisions the VPC (public subnets for the ALB, private-with-egress subnets for the tasks, NAT gateway), the ALB and Fargate service, the SQS queue and its dead-letter queue, the DynamoDB tables, and the notification Lambda. The deploy prints the ALB DNS name and the users-table name as stack outputs.

4. Seed test data:

   ```bash
   npm run seed
   ```

   This populates the users table with test accounts (account ID, email, and a bcrypt-hashed password). The seeded email must be your SES-verified address, or notification emails will not deliver in sandbox mode.

5. Send requests to the ALB DNS name from the deploy output (see the API reference below). The service listens on HTTP port 80; TLS is not configured in this deployment.

### Teardown

```bash
cdk destroy
```

The DynamoDB tables use a `DESTROY` removal policy, so teardown deletes them along with their data. Re-run the seed step after any fresh deploy.

---

## API Reference

Base URL: the ALB DNS name from the CDK deploy output, over HTTP on port 80.

### POST /transactions

Submits a transaction for fraud evaluation.

**Request body**

```json
{
  "account_id": "StoneHu",
  "amount": 15000,
  "transaction_type": "withdrawal",
  "location": "Canada",
  "timestamp": "2026-06-22T01:49:35.000Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `account_id` | string | Required. |
| `amount` | number | Required, must be greater than 0. |
| `transaction_type` | string | Required. One of `withdrawal`, `deposit`, `transfer`. |
| `location` | string | Required. |
| `timestamp` | string | Required, ISO 8601. Overwritten server-side with the receive time, but a valid value is still required to pass validation. |

**Response — 200 OK**

```json
{
  "transaction_id": "963f2388-61bd-4a91-a314-4f99f70a9f4b",
  "account_id": "StoneHu",
  "status": "flagged",
  "reasons": ["LARGE_WITHDRAWAL"]
}
```

`status` is `approved` or `flagged`. `reasons` lists the rules that fired (empty for an approved transaction).

> [!WARNING]
> A production app should not return the list of reasons a transaction was flagged. I only do so here for demonstration purposes.

**Response — 400 Bad Request** (validation failure)

```json
{ "error": "amount must be greater than 0" }
```

**Response — 500 Internal Server Error**

```json
{ "error": "Internal server error" }
```

### POST /login

Verifies credentials and records failed attempts (the input for Rule 3). Does not issue a token.

**Request body**

```json
{ "account_id": "StoneHu", "password": "123456" }
```

> [!WARNING]
> Sending a plaintext password through HTTP is a terrible idea. However, getting a publicly trusted TLS certificate requires owning a real domain, which is overkill for an assessment. Please pretend this is HTTPS.

**Response — 200 OK**

```json
{ "account_id": "StoneHu" }
```

**Response — 401 Unauthorized** (wrong password or unknown account — deliberately indistinguishable to avoid leaking which account IDs exist)

```json
{ "error": "Invalid credentials" }
```

Returns 400 for missing or malformed fields, and 500 on a server error.

### GET /health

Unauthenticated shallow health check used by the ALB target group. Returns 200 while the service is up.

---

## Notes & Known Limitations

A few deliberate simplifications and known gaps, called out here so they aren't mistaken for oversights.

**1. Transactions are not tied to authentication.** The `/transactions` endpoint is unauthenticated and accepts an `account_id` directly in the request body, so any caller can submit a transaction on behalf of any account. In a real system the caller would authenticate first (via a JWT issued at login, not implemented here) and the account identity would be taken from the verified token rather than the request body, so the client wouldn't send `account_id` at all. Instead, this API treats the supplied `account_id` as trusted input.

**2. Credentials travel over plain HTTP.** The service is exposed over HTTP on port 80; TLS was left out because it requires a custom domain and an ACM certificate, which were out of scope for this project. This means login passwords traverse the internet in plaintext. Assume HTTPS for any real deployment: in this architecture TLS would terminate at the ALB, encrypting all traffic, including credentials.

**3. Flag reasons are returned to the client.** The `/transactions` response includes the specific `reasons` a transaction was flagged. This is convenient for demonstrating the rules, but in production it would be a weakness: telling callers exactly which rule they tripped provides a guideline for evading detection. A production API would return only an `approved` / `flagged` status and keep the reasons server-side for logging and review.

**4. SES uses a verified email address, not a verified domain.** Notifications send from a single verified SES email identity rather than a verified sending domain (which requires owning that domain). As a result the account stays in the SES sandbox, and messages seem to often get filtered as spam. In a real environment, you would own a sending domain to freely send emails through SES.
