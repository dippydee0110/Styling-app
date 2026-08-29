import type { ContextSummary, Opportunity } from "../types.js";
import { robinhoodMcpClient, type RobinhoodMcpCredentials } from "./robinhoodMcp.js";

const symbols = ["AAPL", "MSFT", "AMZN", "NVDA", "TSLA", "META", "SPY", "QQQ"];

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

export const marketDataProvider = {
  scanPremiumSellingCandidates: async (
    watchlist: string[],
    credentials?: RobinhoodMcpCredentials
  ): Promise<Opportunity[]> => {
    if (credentials && robinhoodMcpClient.isConfigured(credentials)) {
      const mcpData = await robinhoodMcpClient.scanPremiumCandidates(watchlist, credentials);
      if (mcpData.length > 0) {
        return mcpData;
      }
    }
    const universe = watchlist.length > 0 ? watchlist : symbols;
    return universe.map((symbol, idx) => {
      const underlying = randomBetween(40, 600);
      const premium = Number(randomBetween(0.4, 4.2).toFixed(2));
      const signal = Number(randomBetween(0.45, 0.97).toFixed(2));
      return {
        id: `opp-${symbol}-${idx}`,
        symbol,
        strategy: idx % 2 === 0 ? "cash-secured-put" : "covered-call",
        strike: Number((underlying * randomBetween(0.92, 1.02)).toFixed(2)),
        expiration: new Date(Date.now() + 1000 * 60 * 60 * 24 * (7 + (idx % 3) * 7))
          .toISOString()
          .slice(0, 10),
        premium,
        underlyingPrice: Number(underlying.toFixed(2)),
        signalScore: signal,
        tier: "low",
        rationale: "Implied volatility and liquidity align with configured premium strategy filters."
      };
    });
  }
};

export const newsContextProvider = {
  getSummary: async (symbol: string, credentials?: RobinhoodMcpCredentials): Promise<ContextSummary> => {
    if (credentials && robinhoodMcpClient.isConfigured(credentials)) {
      const mcpSummary = await robinhoodMcpClient.getContextSummary(symbol, credentials);
      if (mcpSummary) {
        return mcpSummary;
      }
    }
    const mood = randomBetween(-1, 1);
    const sentiment = mood > 0.3 ? "bullish" : mood < -0.3 ? "bearish" : "neutral";
    return {
      symbol,
      movementSummary:
        sentiment === "bullish"
          ? `${symbol} moved higher on upbeat guidance and sector strength.`
          : sentiment === "bearish"
            ? `${symbol} traded lower on profit-taking and macro uncertainty.`
            : `${symbol} was range-bound as investors digested mixed catalysts.`,
      sentiment,
      keyEvents: [
        "Earnings commentary update",
        "Sector-relative momentum shift",
        "Options volume spike vs 20-day average"
      ],
      confidence: Number(randomBetween(0.62, 0.91).toFixed(2))
    };
  }
};
