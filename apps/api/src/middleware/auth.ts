import type { NextFunction, Request, Response } from "express";
import { getSessionContext } from "../data/store.js";
import type { RobinhoodMcpCredentials } from "../services/robinhoodMcp.js";

export interface AuthenticatedRequest extends Request {
  auth: {
    userId: string;
    principal: string;
    robinhoodUsername: string | null;
    mcpCredentials: RobinhoodMcpCredentials;
  };
}

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const header = req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  void getSessionContext(token)
    .then((session) => {
      if (!session) {
        res.status(401).json({ error: "Invalid or expired session token." });
        return;
      }
      (req as AuthenticatedRequest).auth = session;
      next();
    })
    .catch((error: unknown) => {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: "Authentication lookup failed." });
    });
};
