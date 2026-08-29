import cors from "cors";
import express from "express";
import { randomBytes } from "crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  addUserAlert,
  createUserAccount,
  getUserAccounts,
  getUserAlerts,
  initializeStore,
  loginUser,
  refreshUserSession,
  registerUser,
  updateRobinhoodConfig,
  updateUserAccountSettings,
  verifyRegistrationChallenge
} from "./data/store.js";
import { requireAuth, type AuthenticatedRequest } from "./middleware/auth.js";
import { summarizeOpportunity } from "./services/interpreter.js";
import { newsContextProvider, marketDataProvider } from "./services/providers.js";
import { robinhoodMcpClient } from "./services/robinhoodMcp.js";
import { buildRecommendation, rankOpportunities } from "./services/scoring.js";
import type { BrokerAccount } from "./types.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const port = Number(process.env.PORT ?? 4000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const AUTH_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? (IS_PRODUCTION ? 15 * 60 * 1000 : 60 * 1000));
const AUTH_LOGIN_MAX = Number(process.env.AUTH_LOGIN_MAX_ATTEMPTS_PER_WINDOW ?? (IS_PRODUCTION ? 10 : 120));
const AUTH_REGISTER_MAX = Number(process.env.AUTH_REGISTER_MAX_ATTEMPTS_PER_WINDOW ?? (IS_PRODUCTION ? 8 : 120));
const AUTH_VERIFY_MAX = Number(process.env.AUTH_VERIFY_MAX_ATTEMPTS_PER_WINDOW ?? (IS_PRODUCTION ? 15 : 180));
const AUTH_REFRESH_MAX = Number(process.env.AUTH_REFRESH_MAX_ATTEMPTS_PER_WINDOW ?? (IS_PRODUCTION ? 40 : 400));
const AUTH_BROKER_CONFIG_MAX = Number(process.env.AUTH_BROKER_CONFIG_MAX_ATTEMPTS_PER_WINDOW ?? (IS_PRODUCTION ? 12 : 120));
const EXECUTE_TRADE_MAX = Number(process.env.EXECUTE_TRADE_MAX_ATTEMPTS_PER_WINDOW ?? (IS_PRODUCTION ? 30 : 300));
const DEFAULT_MCP_URL = process.env.MCP_TRADING_URL?.trim() || "https://agent.robinhood.com/mcp/trading";
const ENABLE_DEV_MOCK_ROBINHOOD_OAUTH = process.env.ENABLE_DEV_MOCK_ROBINHOOD_OAUTH === "true" && !IS_PRODUCTION;

const isLocalIp = (ip: string | undefined): boolean => {
  if (!ip) {
    return false;
  }
  return ip === "::1" || ip === "127.0.0.1" || ip.startsWith("::ffff:127.0.0.1");
};

const buildRateLimiter = (max: number) =>
  rateLimit({
    windowMs: AUTH_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !IS_PRODUCTION && isLocalIp(req.ip),
    handler: (req, res) => {
      const retryAfter = res.getHeader("Retry-After");
      const retrySeconds = typeof retryAfter === "string" ? retryAfter : retryAfter ? String(retryAfter) : null;
      res.status(429).json({
        error: retrySeconds
          ? `Rate limit exceeded. Please retry in about ${retrySeconds} seconds.`
          : "Rate limit exceeded. Please retry shortly."
      });
    }
  });

const registerRateLimiter = buildRateLimiter(AUTH_REGISTER_MAX);
const verifyRateLimiter = buildRateLimiter(AUTH_VERIFY_MAX);
const loginRateLimiter = buildRateLimiter(AUTH_LOGIN_MAX);
const refreshRateLimiter = buildRateLimiter(AUTH_REFRESH_MAX);
const brokerConfigRateLimiter = buildRateLimiter(AUTH_BROKER_CONFIG_MAX);
const executeTradeRateLimiter = buildRateLimiter(EXECUTE_TRADE_MAX);
const robinhoodConnectState = new Map<
  string,
  { userId: string; expiresAt: number; appReturnUrl: string; redirectUri: string; tokenUrl?: string }
>();
const ROBINHOOD_CONNECT_STATE_TTL_MS = 10 * 60 * 1000;
const DEV_MOCK_ROBINHOOD_AUTHORIZE_PATH = "/auth/robinhood/mock-authorize";
const DEV_MOCK_ROBINHOOD_TOKEN_PATH = "/auth/robinhood/mock-token";
const DEV_MOCK_MCP_URL = "https://mock-robinhood-mcp.local";

const registrationSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
    password: z.string().min(8)
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: "Either email or phone is required.",
    path: ["email"]
  });

const verifySchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(4).max(8)
});

const appLoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(8)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});

const mcpConfigSchema = z.object({
  robinhoodUsername: z.string().trim().optional(),
  mcpUrl: z.string().url()
});

const robinhoodConnectRequestSchema = z.object({
  callbackUrl: z.string().url()
});

const accountSchema = z.object({
  label: z.string().min(1),
  watchlist: z.array(z.string()).optional().default([])
});

const settingsSchema = z.object({
  monitorPortfolioAndWatchlist: z.boolean(),
  continuousScan: z.boolean(),
  topOpportunityCount: z.number().int().min(1).max(20),
  lowPremiumMin: z.number().min(0),
  mediumPremiumMin: z.number().min(0),
  highPremiumMin: z.number().min(0),
  highSignalThreshold: z.number().min(0).max(1),
  notifyRiskContextChanges: z.boolean(),
  enableTradeExecution: z.boolean(),
  enableDecisionRecommendations: z.boolean(),
  enableComplexAIOptimization: z.boolean(),
  enableBacktesting: z.boolean(),
  fullyAutomateStrategyChanges: z.boolean()
});

const tradeSchema = z.object({
  opportunityId: z.string(),
  quantity: z.number().int().min(1).max(20),
  confirm: z.literal(true)
});

const handleAsync =
  (handler: (req: express.Request, res: express.Response) => Promise<void>) =>
  (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    void handler(req, res).catch(next);
  };

const logTradeAudit = (
  userId: string,
  accountId: string,
  payload: { opportunityId: string; quantity: number },
  status: "requested" | "queued" | "rejected" | "failed",
  details?: string
): void => {
  console.log(
    JSON.stringify({
      event: "trade_audit",
      timestamp: new Date().toISOString(),
      userId,
      accountId,
      opportunityId: payload.opportunityId,
      quantity: payload.quantity,
      status,
      details: details ?? null
    })
  );
};

const findAccount = (accounts: BrokerAccount[], accountId: string): BrokerAccount | undefined => {
  return accounts.find((account) => account.id === accountId);
};

const getPortfolioValue = (account: BrokerAccount): number => {
  return account.portfolioSpace.positions.reduce((sum, position) => sum + position.quantity * position.currentPrice, 0);
};

const resolveMcpCredentialsFromTokenPayload = (
  tokenPayload: Record<string, unknown>
): {
  mcpApiKey: string;
  mcpUrl: string;
  robinhoodUsername: string;
  refreshToken: string;
  accessTokenExpiresAt: string | null;
  connectionId: string | null;
} => {
  const mcpApiKey =
    (typeof tokenPayload.mcp_api_key === "string" && tokenPayload.mcp_api_key) ||
    (typeof tokenPayload.api_key === "string" && tokenPayload.api_key) ||
    (typeof tokenPayload.access_token === "string" && tokenPayload.access_token) ||
    "";
  const mcpUrl =
    (typeof tokenPayload.mcp_url === "string" && tokenPayload.mcp_url) || process.env.ROBINHOOD_MCP_URL?.trim() || DEFAULT_MCP_URL;
  const robinhoodUsername = (typeof tokenPayload.username === "string" && tokenPayload.username) || "";
  const refreshToken = (typeof tokenPayload.refresh_token === "string" && tokenPayload.refresh_token) || "";
  const expiresInSeconds = typeof tokenPayload.expires_in === "number" ? tokenPayload.expires_in : null;
  const accessTokenExpiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000).toISOString() : null;
  const connectionId =
    (typeof tokenPayload.robinhood_connection_id === "string" && tokenPayload.robinhood_connection_id) ||
    (typeof tokenPayload.connection_id === "string" && tokenPayload.connection_id) ||
    null;
  return { mcpApiKey, mcpUrl, robinhoodUsername, refreshToken, accessTokenExpiresAt, connectionId };
};

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "trading-copilot-api" });
});

app.post(
  "/auth/register",
  registerRateLimiter,
  handleAsync(async (req, res) => {
    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const challenge = await registerUser(parsed.data);
    res.status(201).json({
      message: challenge.deliveryMessage,
      ...challenge
    });
  })
);

app.post(
  "/auth/robinhood/connect-url",
  brokerConfigRateLimiter,
  requireAuth,
  handleAsync(async (req, res) => {
    const parsed = robinhoodConnectRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const apiBase = process.env.API_PUBLIC_BASE_URL?.trim() || `http://localhost:${port}`;
    const redirectUri = `${apiBase}/auth/robinhood/callback`;
    const configuredAuthorizeUrl = process.env.ROBINHOOD_OAUTH_AUTHORIZE_URL?.trim();
    const configuredTokenUrl = process.env.ROBINHOOD_OAUTH_TOKEN_URL?.trim();
    if (!configuredAuthorizeUrl && !ENABLE_DEV_MOCK_ROBINHOOD_OAUTH) {
      res.status(503).json({
        error:
          "ROBINHOOD_OAUTH_AUTHORIZE_URL is not configured. Set it to your real Robinhood authorize endpoint."
      });
      return;
    }
    const authorizeBase =
      configuredAuthorizeUrl || `http://localhost:${port}${DEV_MOCK_ROBINHOOD_AUTHORIZE_PATH}`;
    const tokenUrl = configuredTokenUrl || `http://localhost:${port}${DEV_MOCK_ROBINHOOD_TOKEN_PATH}`;
    const authReq = req as AuthenticatedRequest;
    const state = randomBytes(20).toString("hex");
    robinhoodConnectState.set(state, {
      userId: authReq.auth.userId,
      expiresAt: Date.now() + ROBINHOOD_CONNECT_STATE_TTL_MS,
      appReturnUrl: parsed.data.callbackUrl,
      redirectUri,
      tokenUrl
    });
    const connectUrl = new URL(authorizeBase);
    connectUrl.searchParams.set("redirect_uri", redirectUri);
    connectUrl.searchParams.set("state", state);
    connectUrl.searchParams.set("response_type", "code");
    connectUrl.searchParams.set("client_id", process.env.ROBINHOOD_OAUTH_CLIENT_ID?.trim() || "trading-copilot");
    connectUrl.searchParams.set("scope", process.env.ROBINHOOD_OAUTH_SCOPE?.trim() || "mcp.read");
    if (!configuredAuthorizeUrl && ENABLE_DEV_MOCK_ROBINHOOD_OAUTH) {
      connectUrl.searchParams.set("mock_mcp_url", process.env.DEV_ROBINHOOD_MCP_URL?.trim() || DEV_MOCK_MCP_URL);
      const configuredDevKey = process.env.DEV_ROBINHOOD_MCP_API_KEY?.trim();
      if (configuredDevKey) {
        connectUrl.searchParams.set("mock_mcp_key", configuredDevKey);
      }
      connectUrl.searchParams.set("mock_token_url", tokenUrl);
    }
    res.json({
      state,
      connectUrl: connectUrl.toString()
    });
  })
);

app.get(
  DEV_MOCK_ROBINHOOD_AUTHORIZE_PATH,
  handleAsync(async (req, res) => {
    if (!ENABLE_DEV_MOCK_ROBINHOOD_OAUTH) {
      res.status(404).json({ error: "Mock OAuth is disabled." });
      return;
    }
    const redirectUri = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri.trim() : "";
    const state = typeof req.query.state === "string" ? req.query.state.trim() : "";
    if (!redirectUri || !state) {
      res.status(400).json({ error: "redirect_uri and state are required." });
      return;
    }
    let callbackUrl: URL;
    try {
      callbackUrl = new URL(redirectUri);
    } catch (_error) {
      res.status(400).json({ error: "Invalid redirect_uri." });
      return;
    }
    const mockUser = typeof req.query.mock_user === "string" && req.query.mock_user.trim()
      ? req.query.mock_user.trim()
      : "demo_robinhood_user";
    const mockMcpUrl =
      typeof req.query.mock_mcp_url === "string" && req.query.mock_mcp_url.trim()
        ? req.query.mock_mcp_url.trim()
        : process.env.DEV_ROBINHOOD_MCP_URL?.trim() || DEV_MOCK_MCP_URL;
    const mockMcpKey =
      typeof req.query.mock_mcp_key === "string" && req.query.mock_mcp_key.trim()
        ? req.query.mock_mcp_key.trim()
        : process.env.DEV_ROBINHOOD_MCP_API_KEY?.trim() || `dev-rh-mcp-${randomBytes(10).toString("hex")}`;
    callbackUrl.searchParams.set("state", state);
    callbackUrl.searchParams.set("code", `mock-code-${randomBytes(8).toString("hex")}`);
    callbackUrl.searchParams.set("mock_user", mockUser);
    callbackUrl.searchParams.set("mock_mcp_url", mockMcpUrl);
    callbackUrl.searchParams.set("mock_mcp_key", mockMcpKey);
    if (typeof req.query.mock_token_url === "string" && req.query.mock_token_url.trim()) {
      callbackUrl.searchParams.set("mock_token_url", req.query.mock_token_url.trim());
    }
    res.redirect(callbackUrl.toString());
  })
);

app.post(
  DEV_MOCK_ROBINHOOD_TOKEN_PATH,
  handleAsync(async (req, res) => {
    if (!ENABLE_DEV_MOCK_ROBINHOOD_OAUTH) {
      res.status(404).json({ error: "Mock OAuth is disabled." });
      return;
    }
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!code.startsWith("mock-code-")) {
      res.status(400).json({ error: "invalid_grant", error_description: "Invalid mock authorization code." });
      return;
    }
    res.json({
      token_type: "Bearer",
      expires_in: 3600,
      access_token: process.env.DEV_ROBINHOOD_MCP_API_KEY?.trim() || `dev-rh-mcp-${randomBytes(10).toString("hex")}`,
      mcp_url: process.env.DEV_ROBINHOOD_MCP_URL?.trim() || DEV_MOCK_MCP_URL,
      username: "demo_robinhood_user"
    });
  })
);

app.get(
  "/auth/robinhood/callback",
  handleAsync(async (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state.trim() : "";
    if (!state) {
      res.status(400).json({ error: "Missing OAuth state." });
      return;
    }
    const stateRecord = robinhoodConnectState.get(state);
    if (!stateRecord) {
      res.status(400).json({ error: "Invalid or expired OAuth state." });
      return;
    }
    robinhoodConnectState.delete(state);
    const returnUrl = new URL(stateRecord.appReturnUrl);
    if (Date.now() > stateRecord.expiresAt) {
      returnUrl.searchParams.set("rh_connect", "error");
      returnUrl.searchParams.set("message", "OAuth state expired. Please retry connect.");
      res.redirect(returnUrl.toString());
      return;
    }
    const error = typeof req.query.error === "string" ? req.query.error.trim() : "";
    const errorDescription = typeof req.query.error_description === "string" ? req.query.error_description.trim() : "";
    if (error) {
      returnUrl.searchParams.set("rh_connect", "error");
      returnUrl.searchParams.set("message", errorDescription || error);
      res.redirect(returnUrl.toString());
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
    if (!code) {
      returnUrl.searchParams.set("rh_connect", "error");
      returnUrl.searchParams.set("message", "Missing authorization code.");
      res.redirect(returnUrl.toString());
      return;
    }
    const tokenUrl =
      (typeof req.query.mock_token_url === "string" && req.query.mock_token_url.trim()) ||
      stateRecord.tokenUrl ||
      process.env.ROBINHOOD_OAUTH_TOKEN_URL?.trim();
    const clientId = process.env.ROBINHOOD_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.ROBINHOOD_OAUTH_CLIENT_SECRET?.trim();
    if (!tokenUrl || !clientId) {
      returnUrl.searchParams.set("rh_connect", "error");
      returnUrl.searchParams.set("message", "OAuth token exchange is not configured on server.");
      res.redirect(returnUrl.toString());
      return;
    }
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: stateRecord.redirectUri,
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {})
      })
    });
    const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>;
    if (!tokenResponse.ok) {
      const providerError =
        (typeof tokenPayload.error_description === "string" && tokenPayload.error_description) ||
        (typeof tokenPayload.error === "string" && tokenPayload.error) ||
        "Token exchange failed.";
      returnUrl.searchParams.set("rh_connect", "error");
      returnUrl.searchParams.set("message", providerError);
      res.redirect(returnUrl.toString());
      return;
    }
    const creds = resolveMcpCredentialsFromTokenPayload({
      ...tokenPayload,
      username:
        (typeof req.query.mock_user === "string" && req.query.mock_user.trim()) ||
        (typeof tokenPayload.username === "string" ? tokenPayload.username : "")
    });
    if (!creds.mcpApiKey || !creds.mcpUrl) {
      returnUrl.searchParams.set("rh_connect", "error");
      returnUrl.searchParams.set("message", "OAuth succeeded but MCP credentials were missing.");
      res.redirect(returnUrl.toString());
      return;
    }
    await updateRobinhoodConfig(stateRecord.userId, {
      robinhoodUsername: creds.robinhoodUsername || "robinhood_user",
      mcpUrl: creds.mcpUrl,
      mcpApiKey: creds.mcpApiKey,
      refreshToken: creds.refreshToken,
      accessTokenExpiresAt: creds.accessTokenExpiresAt ?? undefined,
      robinhoodConnectionId: creds.connectionId ?? stateRecord.userId
    });
    returnUrl.searchParams.set("rh_connect", "success");
    res.redirect(returnUrl.toString());
  })
);

app.post(
  "/auth/verify",
  verifyRateLimiter,
  handleAsync(async (req, res) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    await verifyRegistrationChallenge(parsed.data);
    res.json({ verified: true });
  })
);

app.post(
  "/auth/login",
  loginRateLimiter,
  handleAsync(async (req, res) => {
    const parsed = appLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.json(await loginUser(parsed.data));
  })
);

app.post(
  "/auth/refresh",
  refreshRateLimiter,
  handleAsync(async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    res.json(await refreshUserSession(parsed.data));
  })
);

app.get("/auth/me", requireAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  res.json({
    userId: authReq.auth.userId,
    principal: authReq.auth.principal,
    robinhoodUsername: authReq.auth.robinhoodUsername
  });
});

app.put(
  "/auth/robinhood/config",
  brokerConfigRateLimiter,
  requireAuth,
  handleAsync(async (req, res) => {
    const parsed = mcpConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const authReq = req as AuthenticatedRequest;
    const effectiveApiKey = authReq.auth.mcpCredentials.apiKey.trim();
    if (!effectiveApiKey) {
      res.status(400).json({
        error: "No MCP API key available. Connect Robinhood via OAuth first."
      });
      return;
    }
    await robinhoodMcpClient.validateConnection({
      mcpUrl: parsed.data.mcpUrl,
      apiKey: effectiveApiKey
    });
    await updateRobinhoodConfig(authReq.auth.userId, {
      robinhoodUsername: parsed.data.robinhoodUsername,
      mcpUrl: parsed.data.mcpUrl
    });
    res.json({ updated: true });
  })
);

app.get("/integration-status", requireAuth, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  res.json({
    robinhoodMcpConfigured: robinhoodMcpClient.isConfigured(authReq.auth.mcpCredentials)
  });
});

app.get(
  "/accounts",
  requireAuth,
  handleAsync(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    res.json(await getUserAccounts(authReq.auth.userId));
  })
);

app.post(
  "/accounts",
  requireAuth,
  handleAsync(async (req, res) => {
    const parsed = accountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const authReq = req as AuthenticatedRequest;
    res.status(201).json(await createUserAccount(authReq.auth.userId, parsed.data));
  })
);

app.get(
  "/accounts/:accountId/settings",
  requireAuth,
  handleAsync(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const account = findAccount(await getUserAccounts(authReq.auth.userId), req.params.accountId);
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.json(account.settings);
  })
);

app.put(
  "/accounts/:accountId/settings",
  requireAuth,
  handleAsync(async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const authReq = req as AuthenticatedRequest;
    const updated = await updateUserAccountSettings(authReq.auth.userId, req.params.accountId, parsed.data);
    if (!updated) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.json(updated);
  })
);

app.get(
  "/accounts/:accountId/opportunities",
  requireAuth,
  handleAsync(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const account = findAccount(await getUserAccounts(authReq.auth.userId), req.params.accountId);
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    const scanned = await marketDataProvider.scanPremiumSellingCandidates(
      account.portfolioSpace.watchlist,
      authReq.auth.mcpCredentials
    );
    const ranked = rankOpportunities(scanned, account.settings, getPortfolioValue(account));
    const highSignal = ranked.filter((opportunity) => opportunity.signalScore >= account.settings.highSignalThreshold);
    for (const opportunity of highSignal) {
      await addUserAlert(authReq.auth.userId, {
        id: `alert-${Date.now()}-${opportunity.id}`,
        accountId: account.id,
        opportunityId: opportunity.id,
        severity: "high",
        message: `${opportunity.symbol} cleared signal threshold (${opportunity.signalScore}).`,
        createdAt: new Date().toISOString()
      });
    }
    res.json({
      opportunities: ranked.map((opportunity) => ({
        ...opportunity,
        summary: summarizeOpportunity(opportunity),
        recommendation: account.settings.enableDecisionRecommendations ? buildRecommendation(opportunity) : undefined
      })),
      highSignalCount: highSignal.length
    });
  })
);

app.get(
  "/accounts/:accountId/alerts",
  requireAuth,
  handleAsync(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const account = findAccount(await getUserAccounts(authReq.auth.userId), req.params.accountId);
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    const alerts = await getUserAlerts(authReq.auth.userId);
    res.json(
      alerts
        .filter((alert) => alert.accountId === account.id)
        .slice(-25)
        .reverse()
    );
  })
);

app.get(
  "/accounts/:accountId/positions",
  requireAuth,
  handleAsync(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const account = findAccount(await getUserAccounts(authReq.auth.userId), req.params.accountId);
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    const positions = account.portfolioSpace.positions.map((position) => {
      const pnl = (position.currentPrice - position.costBasis) * position.quantity;
      return {
        ...position,
        pnl: Number(pnl.toFixed(2)),
        pnlPct: Number((((position.currentPrice - position.costBasis) / position.costBasis) * 100).toFixed(2))
      };
    });
    res.json(positions);
  })
);

app.get(
  "/accounts/:accountId/context/:symbol",
  requireAuth,
  handleAsync(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const account = findAccount(await getUserAccounts(authReq.auth.userId), req.params.accountId);
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.json(await newsContextProvider.getSummary(req.params.symbol.toUpperCase(), authReq.auth.mcpCredentials));
  })
);

app.post(
  "/accounts/:accountId/execute-trade",
  executeTradeRateLimiter,
  requireAuth,
  handleAsync(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const account = findAccount(await getUserAccounts(authReq.auth.userId), req.params.accountId);
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    if (!account.settings.enableTradeExecution) {
      res.status(403).json({ error: "Trade execution is disabled in settings." });
      return;
    }
    const parsed = tradeSchema.safeParse(req.body);
    if (!parsed.success) {
      logTradeAudit(authReq.auth.userId, req.params.accountId, { opportunityId: "unknown", quantity: 0 }, "rejected", "Invalid trade payload.");
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    logTradeAudit(authReq.auth.userId, account.id, parsed.data, "requested", "User-confirmed trade request received.");
    const brokerResponse = await robinhoodMcpClient.executeTrade(
      account.id,
      parsed.data.opportunityId,
      parsed.data.quantity,
      authReq.auth.mcpCredentials
    );
    logTradeAudit(authReq.auth.userId, account.id, parsed.data, "queued", brokerResponse.message);
    res.json({
      status: "queued",
      broker: account.provider,
      accountId: account.id,
      ...parsed.data,
      message: brokerResponse.message
    });
  })
);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof Error) {
    res.status(500).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: "Unknown server error." });
});

const start = async (): Promise<void> => {
  await initializeStore();
  app.listen(port, () => {
    console.log(`Trading Copilot API running on port ${port}`);
  });
};

void start();
