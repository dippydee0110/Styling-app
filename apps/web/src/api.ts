export interface AdminSettings {
  monitorPortfolioAndWatchlist: boolean;
  continuousScan: boolean;
  topOpportunityCount: number;
  lowPremiumMin: number;
  mediumPremiumMin: number;
  highPremiumMin: number;
  highSignalThreshold: number;
  notifyRiskContextChanges: boolean;
  enableTradeExecution: boolean;
  enableDecisionRecommendations: boolean;
  enableComplexAIOptimization: boolean;
  enableBacktesting: boolean;
  fullyAutomateStrategyChanges: boolean;
}

export interface Account {
  id: string;
  label: string;
  provider: "robinhood";
}

export interface ContextSummary {
  symbol: string;
  movementSummary: string;
  sentiment: "bearish" | "neutral" | "bullish";
  keyEvents: string[];
  confidence: number;
}

export interface Opportunity {
  id: string;
  symbol: string;
  strategy: string;
  premium: number;
  signalScore: number;
  tier: "low" | "medium" | "high";
  summary: string;
  recommendation?: string;
  risk: {
    premiumPct: number;
    assignmentProbability: number;
    allocationImpact: number;
  };
}

export interface RobinhoodConnectUrlResponse {
  connectUrl: string;
}


const API_BASE = "http://localhost:4000";
let accessToken = "";
let refreshToken = "";

const authHeaders = (json = false): HeadersInit => {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (json) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
};

const rawRequest = async (path: string, init?: RequestInit): Promise<Response> => {
  return fetch(`${API_BASE}${path}`, init);
};

const parseApiError = async (response: Response, fallback: string): Promise<string> => {
  try {
    const payload = (await response.json()) as
      | { error?: string | { formErrors?: string[]; fieldErrors?: Record<string, string[]> } }
      | undefined;
    if (!payload || payload.error === undefined) {
      return fallback;
    }
    if (typeof payload.error === "string" && payload.error.trim().length > 0) {
      return payload.error;
    }
    if (typeof payload.error === "object" && payload.error) {
      const formError = payload.error.formErrors?.find((entry) => entry.trim().length > 0);
      if (formError) {
        return formError;
      }
      const fieldError = Object.values(payload.error.fieldErrors ?? {})
        .flat()
        .find((entry) => entry.trim().length > 0);
      if (fieldError) {
        return fieldError;
      }
    }
  } catch (_error) {
    return fallback;
  }
  return fallback;
};

const requestWithRefresh = async (path: string, init?: RequestInit): Promise<Response> => {
  const first = await rawRequest(path, init);
  if (first.status !== 401 || !refreshToken) {
    return first;
  }
  const refreshed = await rawRequest("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });
  if (!refreshed.ok) {
    return first;
  }
  const payload = (await refreshed.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  accessToken = payload.accessToken;
  refreshToken = payload.refreshToken;
  const retryHeaders = new Headers(init?.headers);
  retryHeaders.set("Authorization", `Bearer ${accessToken}`);
  return rawRequest(path, {
    ...init,
    headers: retryHeaders
  });
};

export const api = {
  setTokens: (tokens: { accessToken: string; refreshToken: string }): void => {
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
  },
  clearTokens: (): void => {
    accessToken = "";
    refreshToken = "";
  },
  register: async (payload: {
    email?: string;
    phone?: string;
    password: string;
  }): Promise<{
    challengeId: string;
    target: string;
    deliveryChannel: "email" | "sms";
    deliveryStatus: "dev-preview" | "queued";
    deliveryMessage: string;
    autoVerified: boolean;
    devVerificationCode?: string;
  }> => {
    const response = await rawRequest("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(await parseApiError(response, "Registration failed."));
    }
    return response.json();
  },
  verify: async (payload: { challengeId: string; code: string }): Promise<void> => {
    const response = await rawRequest("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(await parseApiError(response, "Verification failed."));
    }
  },
  login: async (payload: {
    identifier: string;
    password: string;
  }): Promise<{ accessToken: string; refreshToken: string; expiresInSeconds: number; user: { userId: string; principal: string } }> => {
    const response = await rawRequest("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(await parseApiError(response, "Login failed."));
    }
    return response.json();
  },
  getMe: async (): Promise<{ userId: string; principal: string; robinhoodUsername: string | null }> => {
    const response = await requestWithRefresh("/auth/me", { headers: authHeaders() });
    if (!response.ok) {
      throw new Error("Not authenticated.");
    }
    return response.json();
  },
  updateRobinhoodConfig: async (payload: {
    robinhoodUsername?: string;
    mcpUrl: string;
  }): Promise<void> => {
    const response = await requestWithRefresh("/auth/robinhood/config", {
      method: "PUT",
      headers: authHeaders(true),
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error("Failed to update Robinhood MCP config.");
    }
  },
  getRobinhoodConnectUrl: async (callbackUrl: string): Promise<RobinhoodConnectUrlResponse> => {
    const response = await requestWithRefresh("/auth/robinhood/connect-url", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ callbackUrl })
    });
    if (!response.ok) {
      throw new Error(await parseApiError(response, "Failed to start Robinhood OAuth connect."));
    }
    return response.json();
  },
  getAccounts: async (): Promise<Account[]> => {
    const response = await requestWithRefresh("/accounts", { headers: authHeaders() });
    if (!response.ok) {
      throw new Error("Failed to fetch accounts.");
    }
    return response.json();
  },
  createAccount: async (label: string, watchlist: string[]): Promise<Account> => {
    const response = await requestWithRefresh("/accounts", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ label, watchlist })
    });
    if (!response.ok) {
      throw new Error("Failed to create account.");
    }
    return response.json();
  },
  getSettings: async (accountId: string): Promise<AdminSettings> => {
    const response = await requestWithRefresh(`/accounts/${accountId}/settings`, { headers: authHeaders() });
    if (!response.ok) {
      throw new Error("Failed to fetch settings.");
    }
    return response.json();
  },
  updateSettings: async (accountId: string, settings: AdminSettings): Promise<AdminSettings> => {
    const response = await requestWithRefresh(`/accounts/${accountId}/settings`, {
      method: "PUT",
      headers: authHeaders(true),
      body: JSON.stringify(settings)
    });
    if (!response.ok) {
      throw new Error("Failed to update settings.");
    }
    return response.json();
  },
  getOpportunities: async (accountId: string): Promise<{ opportunities: Opportunity[]; highSignalCount: number }> => {
    const response = await requestWithRefresh(`/accounts/${accountId}/opportunities`, { headers: authHeaders() });
    if (!response.ok) {
      throw new Error("Failed to fetch opportunities.");
    }
    return response.json();
  },
  getAlerts: async (accountId: string): Promise<Array<{ id: string; message: string; createdAt: string }>> => {
    const response = await requestWithRefresh(`/accounts/${accountId}/alerts`, { headers: authHeaders() });
    if (!response.ok) {
      throw new Error("Failed to fetch alerts.");
    }
    return response.json();
  },
  getPositions: async (
    accountId: string
  ): Promise<Array<{ id: string; symbol: string; strategy: string; pnl: number; pnlPct: number }>> => {
    const response = await requestWithRefresh(`/accounts/${accountId}/positions`, { headers: authHeaders() });
    if (!response.ok) {
      throw new Error("Failed to fetch positions.");
    }
    return response.json();
  },
  getContextSummary: async (accountId: string, symbol: string): Promise<ContextSummary> => {
    const response = await requestWithRefresh(`/accounts/${accountId}/context/${symbol}`, { headers: authHeaders() });
    if (!response.ok) {
      throw new Error("Failed to fetch context summary.");
    }
    return response.json();
  },
  executeTrade: async (accountId: string, opportunityId: string): Promise<{ message: string }> => {
    const response = await requestWithRefresh(`/accounts/${accountId}/execute-trade`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ opportunityId, quantity: 1, confirm: true })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to execute trade: ${errorText}`);
    }
    return response.json();
  }
};
