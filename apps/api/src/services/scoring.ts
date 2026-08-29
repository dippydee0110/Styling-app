import type { AdminSettings, Opportunity, OpportunityWithRisk } from "../types.js";
import { calculateRiskMetrics } from "./risk.js";

const getTier = (premium: number, settings: AdminSettings): "low" | "medium" | "high" => {
  if (premium >= settings.highPremiumMin) {
    return "high";
  }
  if (premium >= settings.mediumPremiumMin) {
    return "medium";
  }
  return "low";
};

export const rankOpportunities = (
  opportunities: Opportunity[],
  settings: AdminSettings,
  portfolioValue: number
): OpportunityWithRisk[] => {
  return opportunities
    .map((opportunity) => {
      const risk = calculateRiskMetrics(opportunity, portfolioValue);
      return {
        ...opportunity,
        tier: getTier(opportunity.premium, settings),
        risk
      };
    })
    .sort((a, b) => b.signalScore - a.signalScore)
    .slice(0, settings.topOpportunityCount);
};

export const buildRecommendation = (opportunity: OpportunityWithRisk): string => {
  if (opportunity.signalScore >= 0.85 && opportunity.risk.assignmentProbability < 20) {
    return "High-confidence candidate. Consider only if this aligns with your risk limits.";
  }
  if (opportunity.signalScore >= 0.75) {
    return "Potential candidate. Validate assignment and concentration risk before acting.";
  }
  return "Lower conviction. Keep on watchlist unless market context improves.";
};

