export type PremiumTier = "low" | "medium" | "high";

export interface Position {
  id: string;
  symbol: string;
  quantity: number;
  costBasis: number;
  currentPrice: number;
  strategy: "cash-secured-put" | "covered-call";
}

export interface Opportunity {
  id: string;
  symbol: string;
  strategy: "cash-secured-put" | "covered-call";
  strike: number;
  expiration: string;
  premium: number;
  underlyingPrice: number;
  signalScore: number;
  tier: PremiumTier;
  rationale: string;
}

export interface RiskMetrics {
  premiumPct: number;
  assignmentProbability: number;
  allocationImpact: number;
}

export interface OpportunityWithRisk extends Opportunity {
  risk: RiskMetrics;
}

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

export interface PortfolioSpace {
  id: string;
  accountId: string;
  watchlist: string[];
  positions: Position[];
}

export interface BrokerAccount {
  id: string;
  provider: "robinhood";
  label: string;
  portfolioSpace: PortfolioSpace;
  settings: AdminSettings;
}

export interface Alert {
  id: string;
  accountId: string;
  opportunityId: string;
  severity: "info" | "high";
  message: string;
  createdAt: string;
}

export interface ContextSummary {
  symbol: string;
  movementSummary: string;
  sentiment: "bearish" | "neutral" | "bullish";
  keyEvents: string[];
  confidence: number;
}

