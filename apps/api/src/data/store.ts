import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "crypto";
import { promisify } from "util";
import { Pool } from "pg";
import type { Alert, AdminSettings, BrokerAccount } from "../types.js";
import type { RobinhoodMcpCredentials } from "../services/robinhoodMcp.js";

const scrypt = promisify(scryptCallback);

interface UserRecord {
  id: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  failedLoginAttempts: number;
  lockoutUntil: string | null;
  verifiedAt: string | null;
  robinhoodUsername: string | null;
  robinhoodConnectionId: string | null;
  encryptedMcpUrl: string | null;
  encryptedMcpApiKey: string | null;
  encryptedRobinhoodRefreshToken: string | null;
  robinhoodAccessTokenExpiresAt: string | null;
  createdAt: string;
}

interface VerificationRecord {
  id: string;
  userId: string;
  target: string;
  codeHash: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

interface AccessSessionRecord {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

interface RefreshSessionRecord {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  replacedByTokenHash: string | null;
}

interface SessionContext {
  userId: string;
  principal: string;
  robinhoodUsername: string | null;
  mcpCredentials: RobinhoodMcpCredentials;
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: { userId: string; principal: string };
}

interface RegisterResult {
  challengeId: string;
  target: string;
  deliveryChannel: "email" | "sms";
  deliveryStatus: "dev-preview" | "queued";
  deliveryMessage: string;
  autoVerified: boolean;
  devVerificationCode?: string;
}

interface AuthRepository {
  initialize(): Promise<void>;
  registerUser(input: { email?: string; phone?: string; password: string }): Promise<RegisterResult>;
  verifyChallenge(input: { challengeId: string; code: string }): Promise<void>;
  login(input: { identifier: string; password: string }): Promise<LoginResult>;
  refresh(input: { refreshToken: string }): Promise<LoginResult>;
  getSessionContext(accessToken: string): Promise<SessionContext | null>;
  updateRobinhoodConfig(
    userId: string,
    config: {
      robinhoodUsername?: string;
      mcpUrl: string;
      mcpApiKey?: string;
      robinhoodConnectionId?: string;
      refreshToken?: string;
      accessTokenExpiresAt?: string;
    }
  ): Promise<void>;
  getUserAccounts(userId: string): Promise<BrokerAccount[]>;
  createUserAccount(userId: string, payload: { label: string; watchlist: string[] }): Promise<BrokerAccount>;
  updateAccountSettings(userId: string, accountId: string, settings: AdminSettings): Promise<AdminSettings | null>;
  getUserAlerts(userId: string): Promise<Alert[]>;
  addUserAlert(userId: string, alert: Alert): Promise<void>;
}

const ACCESS_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900);
const REFRESH_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 30);
const VERIFICATION_TTL_MINUTES = Number(process.env.VERIFICATION_CODE_TTL_MINUTES ?? 10);
const MAX_FAILED_LOGIN_ATTEMPTS = Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS ?? 5);
const LOGIN_LOCKOUT_MINUTES = Number(process.env.LOGIN_LOCKOUT_MINUTES ?? 15);
const AUTO_VERIFY_REGISTRATION = process.env.AUTO_VERIFY_REGISTRATION === "true" || process.env.NODE_ENV !== "production";

const refreshRobinhoodAccessTokenIfNeeded = async (
  user: UserRecord
): Promise<{ accessToken: string | null; refreshToken?: string; accessTokenExpiresAt?: string; updated: boolean }> => {
  const encryptedAccess = user.encryptedMcpApiKey;
  if (!encryptedAccess) {
    return { accessToken: null, updated: false };
  }
  const currentAccessToken = decryptValue(encryptedAccess);
  if (!user.robinhoodAccessTokenExpiresAt) {
    return { accessToken: currentAccessToken, updated: false };
  }
  const expiresAtMs = new Date(user.robinhoodAccessTokenExpiresAt).getTime();
  const refreshBufferMs = 60 * 1000;
  if (expiresAtMs > Date.now() + refreshBufferMs) {
    return { accessToken: currentAccessToken, updated: false };
  }
  if (!user.encryptedRobinhoodRefreshToken) {
    return { accessToken: currentAccessToken, updated: false };
  }
  const tokenUrl = process.env.ROBINHOOD_OAUTH_TOKEN_URL?.trim();
  const clientId = process.env.ROBINHOOD_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.ROBINHOOD_OAUTH_CLIENT_SECRET?.trim();
  if (!tokenUrl || !clientId || !clientSecret) {
    return { accessToken: currentAccessToken, updated: false };
  }
  const refreshToken = decryptValue(user.encryptedRobinhoodRefreshToken);
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  if (!response.ok) {
    throw new Error(`Robinhood token refresh failed with status ${response.status}.`);
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const nextAccess = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!nextAccess) {
    throw new Error("Robinhood token refresh response missing access_token.");
  }
  const nextRefresh = typeof payload.refresh_token === "string" && payload.refresh_token ? payload.refresh_token : refreshToken;
  const expiresInSeconds = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  return {
    accessToken: nextAccess,
    refreshToken: nextRefresh,
    accessTokenExpiresAt: plusSeconds(now(), expiresInSeconds).toISOString(),
    updated: true
  };
};

const defaultSettings: AdminSettings = {
  monitorPortfolioAndWatchlist: true,
  continuousScan: true,
  topOpportunityCount: 5,
  lowPremiumMin: 0.5,
  mediumPremiumMin: 1.25,
  highPremiumMin: 2.0,
  highSignalThreshold: 0.75,
  notifyRiskContextChanges: true,
  enableTradeExecution: true,
  enableDecisionRecommendations: true,
  enableComplexAIOptimization: false,
  enableBacktesting: false,
  fullyAutomateStrategyChanges: false
};

const makeId = (prefix: string): string => `${prefix}-${randomBytes(10).toString("hex")}`;
const now = (): Date => new Date();
const plusSeconds = (date: Date, seconds: number): Date => new Date(date.getTime() + seconds * 1000);
const plusMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60 * 1000);
const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
const hashCode = (code: string): string => createHash("sha256").update(code).digest("hex");
const getDeliveryChannel = (target: string): "email" | "sms" => (target.includes("@") ? "email" : "sms");
const buildRegisterResult = (challengeId: string, target: string, code: string): RegisterResult => {
  const channel = getDeliveryChannel(target);
  const autoVerified = AUTO_VERIFY_REGISTRATION;
  if (process.env.NODE_ENV === "production") {
    return {
      challengeId,
      target,
      deliveryChannel: channel,
      deliveryStatus: "queued",
      deliveryMessage: `Verification ${channel.toUpperCase()} delivery queued.`,
      autoVerified
    };
  }
  return {
    challengeId,
    target,
    deliveryChannel: channel,
    deliveryStatus: "dev-preview",
    deliveryMessage: `Development mode: verification code is provided in-app and server logs. Real ${channel.toUpperCase()} delivery provider is not configured.`,
    autoVerified,
    devVerificationCode: code
  };
};

const deriveKey = (): Buffer => {
  const source = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!source) {
    throw new Error("APP_ENCRYPTION_KEY is required.");
  }
  return createHash("sha256").update(source).digest();
};

const encryptValue = (value: string): string => {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
};

const decryptValue = (payload: string): string => {
  const [ivB64, authTagB64, contentB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !contentB64) {
    throw new Error("Invalid encrypted payload format.");
  }
  const key = deriveKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(contentB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
};

const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
};

const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) {
    return false;
  }
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const normalizeEmail = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const normalizePhone = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const buildPrincipal = (user: UserRecord): string => user.email ?? user.phone ?? user.id;

const defaultAccounts = (userId: string): BrokerAccount[] => [
  {
    id: `acc-${userId}-1`,
    provider: "robinhood",
    label: "Primary Robinhood",
    portfolioSpace: {
      id: `space-${userId}-1`,
      accountId: `acc-${userId}-1`,
      watchlist: ["AAPL", "MSFT", "AMZN", "NVDA", "SPY"],
      positions: [
        {
          id: `pos-${userId}-1`,
          symbol: "AAPL",
          quantity: 100,
          costBasis: 186.5,
          currentPrice: 191.8,
          strategy: "covered-call"
        },
        {
          id: `pos-${userId}-2`,
          symbol: "SPY",
          quantity: 100,
          costBasis: 538.1,
          currentPrice: 541.7,
          strategy: "cash-secured-put"
        }
      ]
    },
    settings: { ...defaultSettings }
  }
];

const issueTokens = (user: UserRecord): LoginResult => {
  const accessToken = randomBytes(32).toString("hex");
  const refreshToken = randomBytes(48).toString("hex");
  return {
    accessToken,
    refreshToken,
    expiresInSeconds: ACCESS_TTL_SECONDS,
    user: {
      userId: user.id,
      principal: buildPrincipal(user)
    }
  };
};

class InMemoryRepository implements AuthRepository {
  private users = new Map<string, UserRecord>();
  private usersByEmail = new Map<string, string>();
  private usersByPhone = new Map<string, string>();
  private verifications = new Map<string, VerificationRecord>();
  private accessSessions = new Map<string, AccessSessionRecord>();
  private refreshSessions = new Map<string, RefreshSessionRecord>();
  private accountsByUser = new Map<string, BrokerAccount[]>();
  private alertsByUser = new Map<string, Alert[]>();

  async initialize(): Promise<void> {}

  private ensureUserData(userId: string): void {
    if (!this.accountsByUser.has(userId)) {
      this.accountsByUser.set(userId, defaultAccounts(userId));
    }
    if (!this.alertsByUser.has(userId)) {
      this.alertsByUser.set(userId, []);
    }
  }

  private revokeAllSessionsForUser(userId: string): void {
    const revokedAt = now().toISOString();
    for (const session of this.accessSessions.values()) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = revokedAt;
      }
    }
    for (const session of this.refreshSessions.values()) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = revokedAt;
      }
    }
  }

  async registerUser(input: { email?: string; phone?: string; password: string }): Promise<RegisterResult> {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    if (!email && !phone) {
      throw new Error("Either email or phone is required.");
    }
    if (email && this.usersByEmail.has(email)) {
      throw new Error("Email already registered.");
    }
    if (phone && this.usersByPhone.has(phone)) {
      throw new Error("Phone already registered.");
    }
    const userId = makeId("usr");
    const passwordHash = await hashPassword(input.password);
    const user: UserRecord = {
      id: userId,
      email,
      phone,
      passwordHash,
      failedLoginAttempts: 0,
      lockoutUntil: null,
      verifiedAt: AUTO_VERIFY_REGISTRATION ? now().toISOString() : null,
      robinhoodUsername: null,
      robinhoodConnectionId: null,
      encryptedMcpUrl: null,
      encryptedMcpApiKey: null,
      encryptedRobinhoodRefreshToken: null,
      robinhoodAccessTokenExpiresAt: null,
      createdAt: now().toISOString()
    };
    this.users.set(userId, user);
    if (email) {
      this.usersByEmail.set(email, userId);
    }
    if (phone) {
      this.usersByPhone.set(phone, userId);
    }
    this.ensureUserData(userId);

    const challengeId = makeId("vfy");
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const verification: VerificationRecord = {
      id: challengeId,
      userId,
      target: email ?? phone ?? "",
      codeHash: hashCode(code),
      expiresAt: plusMinutes(now(), VERIFICATION_TTL_MINUTES).toISOString(),
      consumedAt: AUTO_VERIFY_REGISTRATION ? now().toISOString() : null,
      createdAt: now().toISOString()
    };
    this.verifications.set(challengeId, verification);

    if (process.env.NODE_ENV !== "production") {
      console.log(`Verification code for ${verification.target}: ${code}`);
    }
    return buildRegisterResult(challengeId, verification.target, code);
  }

  async verifyChallenge(input: { challengeId: string; code: string }): Promise<void> {
    const verification = this.verifications.get(input.challengeId);
    if (!verification) {
      throw new Error("Verification challenge not found.");
    }
    if (verification.consumedAt) {
      throw new Error("Verification challenge already used.");
    }
    if (new Date(verification.expiresAt).getTime() < now().getTime()) {
      throw new Error("Verification challenge expired.");
    }
    if (verification.codeHash !== hashCode(input.code)) {
      throw new Error("Invalid verification code.");
    }
    verification.consumedAt = now().toISOString();
    const user = this.users.get(verification.userId);
    if (!user) {
      throw new Error("User not found.");
    }
    user.verifiedAt = now().toISOString();
  }

  private findUserByIdentifier(identifier: string): UserRecord | null {
    const normalizedEmail = normalizeEmail(identifier);
    if (normalizedEmail && this.usersByEmail.has(normalizedEmail)) {
      return this.users.get(this.usersByEmail.get(normalizedEmail)!) ?? null;
    }
    const normalizedPhone = normalizePhone(identifier);
    if (normalizedPhone && this.usersByPhone.has(normalizedPhone)) {
      return this.users.get(this.usersByPhone.get(normalizedPhone)!) ?? null;
    }
    return null;
  }

  async login(input: { identifier: string; password: string }): Promise<LoginResult> {
    const user = this.findUserByIdentifier(input.identifier);
    if (!user) {
      throw new Error("User not found.");
    }
    if (user.lockoutUntil && new Date(user.lockoutUntil).getTime() > now().getTime()) {
      throw new Error("Account temporarily locked due to failed login attempts.");
    }
    if (!user.verifiedAt) {
      throw new Error("User is not verified.");
    }
    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        user.lockoutUntil = plusMinutes(now(), LOGIN_LOCKOUT_MINUTES).toISOString();
        user.failedLoginAttempts = 0;
      }
      throw new Error("Invalid credentials.");
    }
    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;
    const issued = issueTokens(user);
    const issuedAt = now();
    this.accessSessions.set(hashToken(issued.accessToken), {
      tokenHash: hashToken(issued.accessToken),
      userId: user.id,
      createdAt: issuedAt.toISOString(),
      expiresAt: plusSeconds(issuedAt, ACCESS_TTL_SECONDS).toISOString(),
      revokedAt: null
    });
    this.refreshSessions.set(hashToken(issued.refreshToken), {
      tokenHash: hashToken(issued.refreshToken),
      userId: user.id,
      createdAt: issuedAt.toISOString(),
      expiresAt: plusSeconds(issuedAt, REFRESH_TTL_SECONDS).toISOString(),
      revokedAt: null,
      replacedByTokenHash: null
    });
    return issued;
  }

  async refresh(input: { refreshToken: string }): Promise<LoginResult> {
    const refreshHash = hashToken(input.refreshToken);
    const refreshSession = this.refreshSessions.get(refreshHash);
    if (!refreshSession) {
      throw new Error("Refresh token not found.");
    }
    if (refreshSession.revokedAt) {
      if (refreshSession.replacedByTokenHash) {
        this.revokeAllSessionsForUser(refreshSession.userId);
        throw new Error("Refresh token reuse detected. All sessions have been revoked.");
      }
      throw new Error("Refresh token revoked.");
    }
    if (new Date(refreshSession.expiresAt).getTime() < now().getTime()) {
      throw new Error("Refresh token expired.");
    }
    const user = this.users.get(refreshSession.userId);
    if (!user) {
      throw new Error("User not found.");
    }
    const issued = issueTokens(user);
    const issuedAt = now();
    const newRefreshHash = hashToken(issued.refreshToken);
    this.refreshSessions.set(newRefreshHash, {
      tokenHash: newRefreshHash,
      userId: user.id,
      createdAt: issuedAt.toISOString(),
      expiresAt: plusSeconds(issuedAt, REFRESH_TTL_SECONDS).toISOString(),
      revokedAt: null,
      replacedByTokenHash: null
    });
    refreshSession.revokedAt = issuedAt.toISOString();
    refreshSession.replacedByTokenHash = newRefreshHash;
    const accessHash = hashToken(issued.accessToken);
    this.accessSessions.set(accessHash, {
      tokenHash: accessHash,
      userId: user.id,
      createdAt: issuedAt.toISOString(),
      expiresAt: plusSeconds(issuedAt, ACCESS_TTL_SECONDS).toISOString(),
      revokedAt: null
    });
    return issued;
  }

  async getSessionContext(accessToken: string): Promise<SessionContext | null> {
    const tokenHash = hashToken(accessToken);
    const accessSession = this.accessSessions.get(tokenHash);
    if (!accessSession) {
      return null;
    }
    if (accessSession.revokedAt || new Date(accessSession.expiresAt).getTime() < now().getTime()) {
      return null;
    }
    const user = this.users.get(accessSession.userId);
    if (!user) {
      return null;
    }
    const refreshed = await refreshRobinhoodAccessTokenIfNeeded(user);
    if (refreshed.updated && refreshed.accessToken && refreshed.refreshToken && refreshed.accessTokenExpiresAt) {
      user.encryptedMcpApiKey = encryptValue(refreshed.accessToken);
      user.encryptedRobinhoodRefreshToken = encryptValue(refreshed.refreshToken);
      user.robinhoodAccessTokenExpiresAt = refreshed.accessTokenExpiresAt;
    }
    return {
      userId: user.id,
      principal: buildPrincipal(user),
      robinhoodUsername: user.robinhoodUsername,
      mcpCredentials: {
        mcpUrl: user.encryptedMcpUrl ? decryptValue(user.encryptedMcpUrl) : "",
        apiKey: refreshed.accessToken ?? ""
      }
    };
  }

  async updateRobinhoodConfig(
    userId: string,
    config: {
      robinhoodUsername?: string;
      mcpUrl: string;
      mcpApiKey?: string;
      robinhoodConnectionId?: string;
      refreshToken?: string;
      accessTokenExpiresAt?: string;
    }
  ): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error("User not found.");
    }
    user.robinhoodUsername = config.robinhoodUsername?.trim() ? config.robinhoodUsername.trim() : null;
    user.encryptedMcpUrl = encryptValue(config.mcpUrl);
    if (config.mcpApiKey?.trim()) {
      user.encryptedMcpApiKey = encryptValue(config.mcpApiKey.trim());
    }
    if (config.refreshToken?.trim()) {
      user.encryptedRobinhoodRefreshToken = encryptValue(config.refreshToken.trim());
    }
    if (config.accessTokenExpiresAt) {
      user.robinhoodAccessTokenExpiresAt = config.accessTokenExpiresAt;
    }
    if (config.robinhoodConnectionId) {
      user.robinhoodConnectionId = config.robinhoodConnectionId;
    }
  }

  async getUserAccounts(userId: string): Promise<BrokerAccount[]> {
    this.ensureUserData(userId);
    return this.accountsByUser.get(userId) ?? [];
  }

  async createUserAccount(userId: string, payload: { label: string; watchlist: string[] }): Promise<BrokerAccount> {
    this.ensureUserData(userId);
    const accounts = this.accountsByUser.get(userId) ?? [];
    const nextOrdinal = accounts.length + 1;
    const nextId = `acc-${userId}-${nextOrdinal}`;
    const account: BrokerAccount = {
      id: nextId,
      provider: "robinhood",
      label: payload.label,
      portfolioSpace: {
        id: `space-${userId}-${nextOrdinal}`,
        accountId: nextId,
        watchlist: payload.watchlist,
        positions: []
      },
      settings: { ...defaultSettings }
    };
    accounts.push(account);
    this.accountsByUser.set(userId, accounts);
    return account;
  }

  async updateAccountSettings(userId: string, accountId: string, settings: AdminSettings): Promise<AdminSettings | null> {
    this.ensureUserData(userId);
    const account = (this.accountsByUser.get(userId) ?? []).find((item) => item.id === accountId);
    if (!account) {
      return null;
    }
    account.settings = settings;
    return account.settings;
  }

  async getUserAlerts(userId: string): Promise<Alert[]> {
    this.ensureUserData(userId);
    return this.alertsByUser.get(userId) ?? [];
  }

  async addUserAlert(userId: string, alert: Alert): Promise<void> {
    this.ensureUserData(userId);
    const alerts = this.alertsByUser.get(userId) ?? [];
    alerts.push(alert);
    this.alertsByUser.set(userId, alerts);
  }
}

class PostgresRepository implements AuthRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.PG_SSLMODE === "require" ? { rejectUnauthorized: false } : undefined
    });
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        phone TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        lockout_until TIMESTAMPTZ,
        verified_at TIMESTAMPTZ,
        robinhood_username TEXT,
        robinhood_connection_id TEXT,
        encrypted_mcp_url TEXT,
        encrypted_mcp_api_key TEXT,
        encrypted_robinhood_refresh_token TEXT,
        robinhood_access_token_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS verification_challenges (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES app_users(id),
        target TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS access_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES app_users(id),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS refresh_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES app_users(id),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        replaced_by_token_hash TEXT
      );
      CREATE TABLE IF NOT EXISTS portfolio_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES app_users(id),
        provider TEXT NOT NULL,
        label TEXT NOT NULL,
        portfolio_space_id TEXT NOT NULL,
        watchlist_json TEXT NOT NULL,
        positions_json TEXT NOT NULL,
        settings_json TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES app_users(id),
        account_id TEXT NOT NULL,
        opportunity_id TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS lockout_until TIMESTAMPTZ;
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS robinhood_connection_id TEXT;
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS encrypted_robinhood_refresh_token TEXT;
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS robinhood_access_token_expires_at TIMESTAMPTZ;
    `);
  }

  private mapUser(row: Record<string, unknown>): UserRecord {
    return {
      id: String(row.id),
      email: row.email ? String(row.email) : null,
      phone: row.phone ? String(row.phone) : null,
      passwordHash: String(row.password_hash),
      failedLoginAttempts: Number(row.failed_login_attempts ?? 0),
      lockoutUntil: row.lockout_until ? new Date(String(row.lockout_until)).toISOString() : null,
      verifiedAt: row.verified_at ? new Date(String(row.verified_at)).toISOString() : null,
      robinhoodUsername: row.robinhood_username ? String(row.robinhood_username) : null,
      robinhoodConnectionId: row.robinhood_connection_id ? String(row.robinhood_connection_id) : null,
      encryptedMcpUrl: row.encrypted_mcp_url ? String(row.encrypted_mcp_url) : null,
      encryptedMcpApiKey: row.encrypted_mcp_api_key ? String(row.encrypted_mcp_api_key) : null,
      encryptedRobinhoodRefreshToken: row.encrypted_robinhood_refresh_token ? String(row.encrypted_robinhood_refresh_token) : null,
      robinhoodAccessTokenExpiresAt: row.robinhood_access_token_expires_at
        ? new Date(String(row.robinhood_access_token_expires_at)).toISOString()
        : null,
      createdAt: new Date(String(row.created_at)).toISOString()
    };
  }

  private async revokeAllSessionsForUser(userId: string): Promise<void> {
    const revokedAt = now().toISOString();
    await this.pool.query(`UPDATE access_sessions SET revoked_at = $1 WHERE user_id = $2 AND revoked_at IS NULL`, [
      revokedAt,
      userId
    ]);
    await this.pool.query(`UPDATE refresh_sessions SET revoked_at = $1 WHERE user_id = $2 AND revoked_at IS NULL`, [
      revokedAt,
      userId
    ]);
  }

  async registerUser(input: { email?: string; phone?: string; password: string }): Promise<RegisterResult> {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    if (!email && !phone) {
      throw new Error("Either email or phone is required.");
    }

    const existing = await this.pool.query(
      `SELECT id FROM app_users WHERE ($1::text IS NOT NULL AND email = $1) OR ($2::text IS NOT NULL AND phone = $2)`,
      [email, phone]
    );
    if ((existing.rowCount ?? 0) > 0) {
      throw new Error("User with this email/phone already exists.");
    }

    const userId = makeId("usr");
    const userCreatedAt = now().toISOString();
    const autoVerifiedAt = AUTO_VERIFY_REGISTRATION ? now().toISOString() : null;
    await this.pool.query(
      `INSERT INTO app_users (id, email, phone, password_hash, verified_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, email, phone, await hashPassword(input.password), autoVerifiedAt, userCreatedAt]
    );

    const challengeId = makeId("vfy");
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const challengeExpiresAt = plusMinutes(now(), VERIFICATION_TTL_MINUTES).toISOString();
    const challengeConsumedAt = AUTO_VERIFY_REGISTRATION ? now().toISOString() : null;
    await this.pool.query(
      `INSERT INTO verification_challenges (id, user_id, target, code_hash, expires_at, consumed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [challengeId, userId, email ?? phone ?? "", hashCode(code), challengeExpiresAt, challengeConsumedAt, now().toISOString()]
    );

    if (process.env.NODE_ENV !== "production") {
      console.log(`Verification code for ${email ?? phone ?? userId}: ${code}`);
    }

    const defaultAccount = defaultAccounts(userId)[0];
    await this.pool.query(
      `INSERT INTO portfolio_accounts
        (id, user_id, provider, label, portfolio_space_id, watchlist_json, positions_json, settings_json, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        defaultAccount.id,
        userId,
        defaultAccount.provider,
        defaultAccount.label,
        defaultAccount.portfolioSpace.id,
        JSON.stringify(defaultAccount.portfolioSpace.watchlist),
        JSON.stringify(defaultAccount.portfolioSpace.positions),
        JSON.stringify(defaultAccount.settings),
        now().toISOString()
      ]
    );

    return buildRegisterResult(challengeId, email ?? phone ?? "", code);
  }

  async verifyChallenge(input: { challengeId: string; code: string }): Promise<void> {
    const result = await this.pool.query(`SELECT * FROM verification_challenges WHERE id = $1`, [input.challengeId]);
    if ((result.rowCount ?? 0) === 0) {
      throw new Error("Verification challenge not found.");
    }
    const row = result.rows[0] as Record<string, unknown>;
    if (row.consumed_at) {
      throw new Error("Verification challenge already used.");
    }
    if (new Date(String(row.expires_at)).getTime() < now().getTime()) {
      throw new Error("Verification challenge expired.");
    }
    if (String(row.code_hash) !== hashCode(input.code)) {
      throw new Error("Invalid verification code.");
    }
    await this.pool.query(`UPDATE verification_challenges SET consumed_at = $1 WHERE id = $2`, [
      now().toISOString(),
      input.challengeId
    ]);
    await this.pool.query(`UPDATE app_users SET verified_at = $1 WHERE id = $2`, [now().toISOString(), String(row.user_id)]);
  }

  async login(input: { identifier: string; password: string }): Promise<LoginResult> {
    const email = normalizeEmail(input.identifier);
    const phone = normalizePhone(input.identifier);
    const result = await this.pool.query(
      `SELECT * FROM app_users
       WHERE ($1::text IS NOT NULL AND email = $1) OR ($2::text IS NOT NULL AND phone = $2)
       LIMIT 1`,
      [email, phone]
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new Error("User not found.");
    }
    const user = this.mapUser(result.rows[0] as Record<string, unknown>);
    if (user.lockoutUntil && new Date(user.lockoutUntil).getTime() > now().getTime()) {
      throw new Error("Account temporarily locked due to failed login attempts.");
    }
    if (!user.verifiedAt) {
      throw new Error("User is not verified.");
    }
    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      const failedAttempts = user.failedLoginAttempts + 1;
      if (failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        await this.pool.query(
          `UPDATE app_users
           SET failed_login_attempts = 0, lockout_until = $1
           WHERE id = $2`,
          [plusMinutes(now(), LOGIN_LOCKOUT_MINUTES).toISOString(), user.id]
        );
      } else {
        await this.pool.query(`UPDATE app_users SET failed_login_attempts = $1 WHERE id = $2`, [failedAttempts, user.id]);
      }
      throw new Error("Invalid credentials.");
    }
    await this.pool.query(`UPDATE app_users SET failed_login_attempts = 0, lockout_until = NULL WHERE id = $1`, [user.id]);
    const issued = issueTokens(user);
    const issuedAt = now();
    await this.pool.query(
      `INSERT INTO access_sessions (token_hash, user_id, expires_at, created_at) VALUES ($1,$2,$3,$4)`,
      [hashToken(issued.accessToken), user.id, plusSeconds(issuedAt, ACCESS_TTL_SECONDS).toISOString(), issuedAt.toISOString()]
    );
    await this.pool.query(
      `INSERT INTO refresh_sessions (token_hash, user_id, expires_at, created_at) VALUES ($1,$2,$3,$4)`,
      [hashToken(issued.refreshToken), user.id, plusSeconds(issuedAt, REFRESH_TTL_SECONDS).toISOString(), issuedAt.toISOString()]
    );
    return issued;
  }

  async refresh(input: { refreshToken: string }): Promise<LoginResult> {
    const tokenHash = hashToken(input.refreshToken);
    const refresh = await this.pool.query(`SELECT * FROM refresh_sessions WHERE token_hash = $1`, [tokenHash]);
    if ((refresh.rowCount ?? 0) === 0) {
      throw new Error("Refresh token not found.");
    }
    const row = refresh.rows[0] as Record<string, unknown>;
    if (row.revoked_at) {
      if (row.replaced_by_token_hash) {
        await this.revokeAllSessionsForUser(String(row.user_id));
        throw new Error("Refresh token reuse detected. All sessions have been revoked.");
      }
      throw new Error("Refresh token revoked.");
    }
    if (new Date(String(row.expires_at)).getTime() < now().getTime()) {
      throw new Error("Refresh token expired.");
    }
    const userResult = await this.pool.query(`SELECT * FROM app_users WHERE id = $1`, [String(row.user_id)]);
    if ((userResult.rowCount ?? 0) === 0) {
      throw new Error("User not found.");
    }
    const user = this.mapUser(userResult.rows[0] as Record<string, unknown>);
    const issued = issueTokens(user);
    const issuedAt = now();
    const newRefreshHash = hashToken(issued.refreshToken);
    await this.pool.query(
      `INSERT INTO refresh_sessions (token_hash, user_id, expires_at, created_at)
       VALUES ($1,$2,$3,$4)`,
      [newRefreshHash, user.id, plusSeconds(issuedAt, REFRESH_TTL_SECONDS).toISOString(), issuedAt.toISOString()]
    );
    await this.pool.query(
      `UPDATE refresh_sessions
       SET revoked_at = $1, replaced_by_token_hash = $2
       WHERE token_hash = $3`,
      [issuedAt.toISOString(), newRefreshHash, tokenHash]
    );
    await this.pool.query(
      `INSERT INTO access_sessions (token_hash, user_id, expires_at, created_at)
       VALUES ($1,$2,$3,$4)`,
      [hashToken(issued.accessToken), user.id, plusSeconds(issuedAt, ACCESS_TTL_SECONDS).toISOString(), issuedAt.toISOString()]
    );
    return issued;
  }

  async getSessionContext(accessToken: string): Promise<SessionContext | null> {
    const sessionResult = await this.pool.query(
      `SELECT * FROM access_sessions WHERE token_hash = $1 AND revoked_at IS NULL LIMIT 1`,
      [hashToken(accessToken)]
    );
    if ((sessionResult.rowCount ?? 0) === 0) {
      return null;
    }
    const session = sessionResult.rows[0] as Record<string, unknown>;
    if (new Date(String(session.expires_at)).getTime() < now().getTime()) {
      return null;
    }
    const userResult = await this.pool.query(`SELECT * FROM app_users WHERE id = $1`, [String(session.user_id)]);
    if ((userResult.rowCount ?? 0) === 0) {
      return null;
    }
    const user = this.mapUser(userResult.rows[0] as Record<string, unknown>);
    const refreshed = await refreshRobinhoodAccessTokenIfNeeded(user);
    if (refreshed.updated && refreshed.accessToken && refreshed.refreshToken && refreshed.accessTokenExpiresAt) {
      await this.pool.query(
        `UPDATE app_users
         SET encrypted_mcp_api_key = $1,
             encrypted_robinhood_refresh_token = $2,
             robinhood_access_token_expires_at = $3
         WHERE id = $4`,
        [encryptValue(refreshed.accessToken), encryptValue(refreshed.refreshToken), refreshed.accessTokenExpiresAt, user.id]
      );
    }
    return {
      userId: user.id,
      principal: buildPrincipal(user),
      robinhoodUsername: user.robinhoodUsername,
      mcpCredentials: {
        mcpUrl: user.encryptedMcpUrl ? decryptValue(user.encryptedMcpUrl) : "",
        apiKey: refreshed.accessToken ?? ""
      }
    };
  }

  async updateRobinhoodConfig(
    userId: string,
    config: {
      robinhoodUsername?: string;
      mcpUrl: string;
      mcpApiKey?: string;
      robinhoodConnectionId?: string;
      refreshToken?: string;
      accessTokenExpiresAt?: string;
    }
  ): Promise<void> {
    await this.pool.query(
      `UPDATE app_users
       SET robinhood_username = $1,
           encrypted_mcp_url = $2,
           encrypted_mcp_api_key = COALESCE($3, encrypted_mcp_api_key),
           robinhood_connection_id = COALESCE($4, robinhood_connection_id),
           encrypted_robinhood_refresh_token = COALESCE($5, encrypted_robinhood_refresh_token),
           robinhood_access_token_expires_at = COALESCE($6, robinhood_access_token_expires_at)
       WHERE id = $7`,
      [
        config.robinhoodUsername?.trim() ? config.robinhoodUsername.trim() : null,
        encryptValue(config.mcpUrl),
        config.mcpApiKey?.trim() ? encryptValue(config.mcpApiKey.trim()) : null,
        config.robinhoodConnectionId ?? null,
        config.refreshToken?.trim() ? encryptValue(config.refreshToken.trim()) : null,
        config.accessTokenExpiresAt ?? null,
        userId
      ]
    );
  }

  async getUserAccounts(userId: string): Promise<BrokerAccount[]> {
    const result = await this.pool.query(`SELECT * FROM portfolio_accounts WHERE user_id = $1 ORDER BY created_at ASC`, [userId]);
    return result.rows.map((row) => {
      const watchlist = JSON.parse(String(row.watchlist_json)) as string[];
      const positions = JSON.parse(String(row.positions_json)) as BrokerAccount["portfolioSpace"]["positions"];
      const settings = JSON.parse(String(row.settings_json)) as AdminSettings;
      return {
        id: String(row.id),
        provider: "robinhood",
        label: String(row.label),
        portfolioSpace: {
          id: String(row.portfolio_space_id),
          accountId: String(row.id),
          watchlist,
          positions
        },
        settings
      };
    });
  }

  async createUserAccount(userId: string, payload: { label: string; watchlist: string[] }): Promise<BrokerAccount> {
    const accountId = makeId("acc");
    const portfolioSpaceId = makeId("space");
    const createdAt = now().toISOString();
    await this.pool.query(
      `INSERT INTO portfolio_accounts
        (id, user_id, provider, label, portfolio_space_id, watchlist_json, positions_json, settings_json, created_at)
       VALUES ($1,$2,'robinhood',$3,$4,$5,$6,$7,$8)`,
      [
        accountId,
        userId,
        payload.label,
        portfolioSpaceId,
        JSON.stringify(payload.watchlist),
        JSON.stringify([]),
        JSON.stringify(defaultSettings),
        createdAt
      ]
    );
    return {
      id: accountId,
      provider: "robinhood",
      label: payload.label,
      portfolioSpace: {
        id: portfolioSpaceId,
        accountId,
        watchlist: payload.watchlist,
        positions: []
      },
      settings: { ...defaultSettings }
    };
  }

  async updateAccountSettings(userId: string, accountId: string, settings: AdminSettings): Promise<AdminSettings | null> {
    const result = await this.pool.query(
      `UPDATE portfolio_accounts
       SET settings_json = $1
       WHERE user_id = $2 AND id = $3
       RETURNING id`,
      [JSON.stringify(settings), userId, accountId]
    );
    if ((result.rowCount ?? 0) === 0) {
      return null;
    }
    return settings;
  }

  async getUserAlerts(userId: string): Promise<Alert[]> {
    const result = await this.pool.query(`SELECT * FROM user_alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [userId]);
    return result.rows.map((row) => ({
      id: String(row.id),
      accountId: String(row.account_id),
      opportunityId: String(row.opportunity_id),
      severity: String(row.severity) === "high" ? "high" : "info",
      message: String(row.message),
      createdAt: new Date(String(row.created_at)).toISOString()
    }));
  }

  async addUserAlert(userId: string, alert: Alert): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_alerts (id, user_id, account_id, opportunity_id, severity, message, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [alert.id, userId, alert.accountId, alert.opportunityId, alert.severity, alert.message, alert.createdAt]
    );
  }
}

const repository: AuthRepository = process.env.DATABASE_URL
  ? new PostgresRepository(process.env.DATABASE_URL)
  : new InMemoryRepository();

export const initializeStore = async (): Promise<void> => {
  await repository.initialize();
};

export const registerUser = async (input: { email?: string; phone?: string; password: string }): Promise<RegisterResult> =>
  repository.registerUser(input);

export const verifyRegistrationChallenge = async (input: { challengeId: string; code: string }): Promise<void> =>
  repository.verifyChallenge(input);

export const loginUser = async (input: { identifier: string; password: string }): Promise<LoginResult> => repository.login(input);

export const refreshUserSession = async (input: { refreshToken: string }): Promise<LoginResult> => repository.refresh(input);

export const getSessionContext = async (accessToken: string): Promise<SessionContext | null> =>
  repository.getSessionContext(accessToken);

export const updateRobinhoodConfig = async (
  userId: string,
  config: {
    robinhoodUsername?: string;
    mcpUrl: string;
    mcpApiKey?: string;
    robinhoodConnectionId?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: string;
  }
): Promise<void> => repository.updateRobinhoodConfig(userId, config);

export const getUserAccounts = async (userId: string): Promise<BrokerAccount[]> => repository.getUserAccounts(userId);

export const createUserAccount = async (
  userId: string,
  payload: { label: string; watchlist: string[] }
): Promise<BrokerAccount> => repository.createUserAccount(userId, payload);

export const updateUserAccountSettings = async (
  userId: string,
  accountId: string,
  settings: AdminSettings
): Promise<AdminSettings | null> => repository.updateAccountSettings(userId, accountId, settings);

export const getUserAlerts = async (userId: string): Promise<Alert[]> => repository.getUserAlerts(userId);

export const addUserAlert = async (userId: string, alert: Alert): Promise<void> => repository.addUserAlert(userId, alert);

export const getDefaultSettings = (): AdminSettings => ({ ...defaultSettings });
