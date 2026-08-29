import type { OpportunityWithRisk } from "../types.js";

export const summarizeOpportunity = (opportunity: OpportunityWithRisk): string => {
  return `${opportunity.symbol} ${opportunity.strategy} shows ${Math.round(
    opportunity.signalScore * 100
  )}% signal confidence with ${opportunity.risk.premiumPct}% premium yield and ${opportunity.risk.assignmentProbability}% estimated assignment probability.`;
};

