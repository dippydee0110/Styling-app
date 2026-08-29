import type { ContextSummary, Opportunity } from "../types.js";
import { openaiMcpClient } from "./openaiMcp.js";

export interface RobinhoodMcpCredentials {
  mcpUrl: string;
  apiKey: string;
}

interface RobinhoodMcpOpportunity {
  id: string;
  symbol: string;
  strategy: "cash-secured-put" | "covered-call";
  strike: number;
  expiration: string;
  premium: number;
  underlyingPrice: number;
  signalScore: number;
  tier: "low" | "medium" | "high";
  rationale: string;
}

const headers = (credentials: RobinhoodMcpCredentials): HeadersInit => {
  const result: HeadersInit = { "Content-Type": "application/json" };
  if (credentials.apiKey.trim().length > 0) {
    result.Authorization = `Bearer ${credentials.apiKey}`;
  }
  return result;
};

const parseOpportunities = (payload: unknown): Opportunity[] => {
  if (!payload || typeof payload !== "object" || !("opportunities" in payload)) {
    return [];
  }
  const opportunities = (payload as { opportunities?: RobinhoodMcpOpportunity[] }).opportunities;
  if (!Array.isArray(opportunities)) {
    return [];
  }
  return opportunities
    .filter((opportunity) => typeof opportunity.symbol === "string" && typeof opportunity.signalScore === "number")
    .map((opportunity) => ({
      id: opportunity.id,
      symbol: opportunity.symbol,
      strategy: opportunity.strategy,
      strike: opportunity.strike,
      expiration: opportunity.expiration,
      premium: opportunity.premium,
      underlyingPrice: opportunity.underlyingPrice,
      signalScore: opportunity.signalScore,
      tier: opportunity.tier,
      rationale: opportunity.rationale
    }));
};

export const robinhoodMcpClient = {
  isConfigured: (credentials: RobinhoodMcpCredentials): boolean =>
    credentials.mcpUrl.trim().length > 0 && credentials.apiKey.trim().length > 0,

  validateConnection: async (credentials: RobinhoodMcpCredentials): Promise<void> => {
    if (openaiMcpClient.isEnabled()) {
      await openaiMcpClient.validateConnection(credentials);
      return;
    }
    const response = await fetch(`${credentials.mcpUrl}/health`, {
      method: "GET",
      headers: headers(credentials)
    });
    if (!response.ok) {
      throw new Error(`Robinhood MCP auth/health check failed with status ${response.status}.`);
    }
  },

  scanPremiumCandidates: async (watchlist: string[], credentials: RobinhoodMcpCredentials): Promise<Opportunity[]> => {
    if (!credentials.mcpUrl) {
      return [];
    }
    if (openaiMcpClient.isEnabled()) {
      return openaiMcpClient.scanPremiumCandidates(watchlist, credentials);
    }
    const response = await fetch(`${credentials.mcpUrl}/scan-premium-candidates`, {
      method: "POST",
      headers: headers(credentials),
      body: JSON.stringify({ watchlist })
    });
    if (!response.ok) {
      throw new Error(`Robinhood MCP scan failed with status ${response.status}.`);
    }
    const payload = (await response.json()) as unknown;
    return parseOpportunities(payload);
  },

  getContextSummary: async (symbol: string, credentials: RobinhoodMcpCredentials): Promise<ContextSummary | null> => {
    if (!credentials.mcpUrl) {
      return null;
    }
    if (openaiMcpClient.isEnabled()) {
      return openaiMcpClient.getContextSummary(symbol, credentials);
    }
    const response = await fetch(`${credentials.mcpUrl}/context-summary/${encodeURIComponent(symbol)}`, {
      method: "GET",
      headers: headers(credentials)
    });
    if (!response.ok) {
      throw new Error(`Robinhood MCP context failed with status ${response.status}.`);
    }
    const payload = (await response.json()) as unknown;
    if (
      !payload ||
      typeof payload !== "object" ||
      !("symbol" in payload) ||
      !("movementSummary" in payload) ||
      !("sentiment" in payload) ||
      !("keyEvents" in payload) ||
      !("confidence" in payload)
    ) {
      return null;
    }
    return payload as ContextSummary;
  },

  executeTrade: async (
    accountId: string,
    opportunityId: string,
    quantity: number,
    credentials: RobinhoodMcpCredentials
  ): Promise<{ message: string }> => {
    if (!credentials.mcpUrl) {
      return {
        message: "Execution request accepted in mock mode. Add MCP credentials in session config for live routing."
      };
    }
    if (openaiMcpClient.isEnabled()) {
      return openaiMcpClient.executeTrade(accountId, opportunityId, quantity, credentials);
    }
    const response = await fetch(`${credentials.mcpUrl}/execute-trade`, {
      method: "POST",
      headers: headers(credentials),
      body: JSON.stringify({ accountId, opportunityId, quantity })
    });
    if (!response.ok) {
      throw new Error(`Robinhood MCP execution failed with status ${response.status}.`);
    }
    return (await response.json()) as { message: string };
  }
};
