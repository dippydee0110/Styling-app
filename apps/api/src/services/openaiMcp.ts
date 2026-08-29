import OpenAI from "openai";
import type { ContextSummary, Opportunity } from "../types.js";
import type { RobinhoodMcpCredentials } from "./robinhoodMcp.js";

const OPENAI_MODEL = process.env.OPENAI_MCP_MODEL?.trim() || "gpt-5-mini";
const OPENAI_USE_MCP_SDK = process.env.OPENAI_USE_MCP_SDK === "true";
const MCP_SCAN_TOOL = process.env.MCP_TOOL_SCAN_PREMIUM_CANDIDATES?.trim() || "scan-premium-candidates";
const MCP_CONTEXT_TOOL = process.env.MCP_TOOL_CONTEXT_SUMMARY?.trim() || "context-summary";
const MCP_EXECUTE_TOOL = process.env.MCP_TOOL_EXECUTE_TRADE?.trim() || "execute-trade";

let cachedClient: OpenAI | null = null;

const getClient = (): OpenAI => {
  if (cachedClient) {
    return cachedClient;
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when OPENAI_USE_MCP_SDK=true.");
  }
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
};

const parseJsonOutput = <T>(outputText: string): T => {
  try {
    return JSON.parse(outputText) as T;
  } catch (_error) {
    throw new Error("OpenAI MCP response was not valid JSON.");
  }
};

const invokeMcpTool = async <T>(
  credentials: RobinhoodMcpCredentials,
  toolName: string,
  args: Record<string, unknown>,
  resultDescription: string
): Promise<T> => {
  const client = getClient();
  const response = await client.responses.create({
    model: OPENAI_MODEL,
    input: `Call MCP tool "${toolName}" with this JSON arguments payload and return only raw JSON for ${resultDescription}: ${JSON.stringify(args)}`,
    tools: [
      {
        type: "mcp",
        server_label: "robinhood",
        server_url: credentials.mcpUrl,
        authorization: `Bearer ${credentials.apiKey}`,
        allowed_tools: [toolName],
        require_approval: "never"
      }
    ],
    tool_choice: {
      type: "mcp",
      server_label: "robinhood",
      name: toolName
    }
  });
  if (!response.output_text || response.output_text.trim().length === 0) {
    throw new Error(`OpenAI MCP ${toolName} returned empty output.`);
  }
  return parseJsonOutput<T>(response.output_text);
};

export const openaiMcpClient = {
  isEnabled: (): boolean => OPENAI_USE_MCP_SDK,

  validateConnection: async (credentials: RobinhoodMcpCredentials): Promise<void> => {
    if (!OPENAI_USE_MCP_SDK) {
      return;
    }
    await invokeMcpTool<Record<string, unknown>>(credentials, MCP_CONTEXT_TOOL, { symbol: "SPY" }, "a context summary object");
  },

  scanPremiumCandidates: async (watchlist: string[], credentials: RobinhoodMcpCredentials): Promise<Opportunity[]> => {
    return invokeMcpTool<Opportunity[]>(credentials, MCP_SCAN_TOOL, { watchlist }, "an opportunities array");
  },

  getContextSummary: async (symbol: string, credentials: RobinhoodMcpCredentials): Promise<ContextSummary | null> => {
    return invokeMcpTool<ContextSummary>(credentials, MCP_CONTEXT_TOOL, { symbol }, "a context summary object");
  },

  executeTrade: async (
    accountId: string,
    opportunityId: string,
    quantity: number,
    credentials: RobinhoodMcpCredentials
  ): Promise<{ message: string }> => {
    return invokeMcpTool<{ message: string }>(
      credentials,
      MCP_EXECUTE_TOOL,
      { accountId, opportunityId, quantity },
      "an execution result object"
    );
  }
};

