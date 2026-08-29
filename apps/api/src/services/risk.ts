import type { Opportunity, RiskMetrics } from "../types.js";

export const calculateRiskMetrics = (opportunity: Opportunity, portfolioValue: number): RiskMetrics => {
  const premiumPct = Number(((opportunity.premium / opportunity.strike) * 100).toFixed(2));
  const assignmentProbability = Number((Math.max(0.05, 1 - opportunity.signalScore) * 100).toFixed(2));
  const notional = opportunity.strike * 100;
  const allocationImpact = Number(((notional / Math.max(1, portfolioValue)) * 100).toFixed(2));
  return {
    premiumPct,
    assignmentProbability,
    allocationImpact
  };
};

