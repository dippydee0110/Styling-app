# Trading Copilot Agent (MVP)

This project is a **personal trading copilot platform** focused on reducing cognitive load by turning market noise into a short list of higher-confidence premium-selling opportunities.

## Intent

Provide a mobile-first trading copilot that surfaces high-confidence premium-selling opportunities for personal use (MVP). This is an experimental tool and not financial advice.

## What this MVP includes

- Multi-account support (one Portfolio Space per account)
- Administrative settings per account
- Opportunity scanning + ranking (top 5)
- Weekly contract premium tiers (low/medium/high)
- Simple risk metrics:
  - Premium %
  - Estimated assignment probability
  - Portfolio allocation impact
- High-signal alerting
- Position monitoring summaries
- Market-context interpretation layer (news/sentiment/event summaries)
- Trade execution endpoint scaffold
- Mobile-first web UI that also works on desktop

## Important boundaries

- This is **not financial advice**.
- AI is used as an interpretation layer, not the core trading engine.
- Broker integration in this MVP is mocked/stubbed and should be replaced with a secure production integration.
- UI is **Robinhood-inspired** (clean, high-contrast, concise), but does not copy proprietary Robinhood assets or templates.

## Tech direction

- Backend: Node.js + TypeScript + Express
- Frontend: React + TypeScript + Vite (responsive mobile-first)
- Data providers: typed interfaces with mock adapters (ready to swap for paid data APIs)

## Quick start

```bash
npm install
npm run dev
```

Then open the web app URL shown by Vite (usually `http://localhost:5173`).

API runs on `http://localhost:4000`.

## Phase 2: app auth, token lifecycle, and Postgres persistence

This version now supports:

- App-user registration via email or phone + password
- Verification-code onboarding flow
- Access token expiry + refresh token rotation
- Refresh token reuse detection with session revocation
- Login lockout after repeated failed attempts
- Auth/trade endpoint rate limiting
- Optional PostgreSQL persistence (falls back to in-memory if `DATABASE_URL` is unset)
- Robinhood + MCP config per authenticated user
- Encrypted at-rest storage of per-user MCP URL + OAuth access/refresh tokens (AES-256-GCM)

### Setup

1. Copy `.env.example` to `.env`.
2. Set `APP_ENCRYPTION_KEY` to a strong secret.
3. (Recommended) Set `DATABASE_URL` to your Postgres instance.
4. Start API and web app.
5. In the web app:
   - Register (email or phone + password)
   - Verify code
   - Login
   - Click **Connect Robinhood** to run OAuth and capture per-user API credentials automatically
   - Optionally adjust MCP URL/display name

### Robinhood OAuth credential capture (per-user)

This app supports OAuth-based user credential capture:

1. User logs into the app.
2. User clicks **Connect Robinhood**.
3. App redirects user to Robinhood authorization.
4. Callback exchanges authorization code for user-scoped credentials.
5. App stores MCP URL + access token + refresh token + expiration encrypted per user.
6. Backend refreshes expired access tokens using refresh token before MCP calls.

Required env vars for real OAuth:

- `ROBINHOOD_OAUTH_AUTHORIZE_URL`
- `ROBINHOOD_OAUTH_TOKEN_URL`
- `ROBINHOOD_OAUTH_CLIENT_ID`
- `ROBINHOOD_OAUTH_CLIENT_SECRET`
- `API_PUBLIC_BASE_URL` (callback base; uses `/auth/robinhood/callback`)

If `ROBINHOOD_OAUTH_AUTHORIZE_URL` is missing, the API now returns a clear configuration error (no silent page-refresh fallback).
For local testing only, set `ENABLE_DEV_MOCK_ROBINHOOD_OAUTH=true`.

### OpenAI SDK MCP mode

If you want Robinhood MCP tool calls to run through the OpenAI SDK (Responses API MCP tool), set:

- `OPENAI_USE_MCP_SDK=true`
- `OPENAI_API_KEY=<your-openai-key>`
- `OPENAI_MCP_MODEL=gpt-5-mini` (or another supported model)

Optional MCP tool name overrides:

- `MCP_TOOL_SCAN_PREMIUM_CANDIDATES` (default: `scan-premium-candidates`)
- `MCP_TOOL_CONTEXT_SUMMARY` (default: `context-summary`)
- `MCP_TOOL_EXECUTE_TRADE` (default: `execute-trade`)

In this mode, the backend invokes Robinhood MCP via OpenAI SDK remote MCP tool wiring rather than direct HTTP endpoint calls.

Note on verification delivery:
- In development mode, the app shows a **Dev verification code** directly in the UI (and logs).
- In development mode, registration is auto-verified by default (`AUTO_VERIFY_REGISTRATION=true`) so login works immediately.
- In production, integrate real email/SMS provider delivery before launch.

### Core auth endpoints

- `POST /auth/register`
- `POST /auth/verify`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`
- `PUT /auth/robinhood/config`
- `POST /auth/robinhood/connect-url`
- `GET /auth/robinhood/callback`

Trading and portfolio endpoints require `Authorization: Bearer <token>`.

### Security behavior

- Failed logins are tracked and lock the account temporarily after threshold breaches.
- If a rotated refresh token is reused, all active sessions for that user are revoked.
- Auth and trade execution routes are rate-limited by configurable environment settings.
- In local development (`NODE_ENV` not `production`), localhost requests bypass these rate limits to reduce onboarding friction.
- Trading actions require explicit client confirmation (`confirm: true`) and strict payload validation.
- Trade requests are audit-logged server-side (user/account/opportunity/quantity/status) without exposing secrets.

### Integration architecture guardrails

- Keep broker authentication and secrets in your backend only (never in prompts).
- Let the AI layer call backend tools/functions; do not let model logic directly authenticate to Robinhood.
- Prefer official Robinhood-supported APIs/endpoints for production usage.
- Backend acts as MCP gateway with user-id mapping, token retrieval/refresh, and audit/rate-limit enforcement.

## Suggested production upgrades

1. Add external delivery for verification codes (SMS/email provider).
2. Replace mock provider adapters with:
   - Reliable market/options data vendor
   - News/sentiment feed
   - Broker execution API
3. Add Redis for distributed rate limiting and session cache.
4. Add push notifications (mobile + desktop).
5. Add backtesting and historical analytics service.
6. Add CI/CD and containerized deployment.
