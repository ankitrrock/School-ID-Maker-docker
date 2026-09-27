import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export const ACCESS_COOKIE = "school_id_access";

export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and contain at least 32 characters.");
  }
  return secret;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Verifies the session cookie and attaches `req.userId`.
 * Responds 401 and stops the chain when the cookie is missing or invalid.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;

  if (!token) {
    res.status(401).json({ message: "Not authenticated." });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret()) as AuthTokenPayload;
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ message: "Session is invalid or expired." });
  }
}
