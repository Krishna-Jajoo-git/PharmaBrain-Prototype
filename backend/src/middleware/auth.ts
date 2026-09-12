import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AuthRequest, JwtPayload } from "../types/index.js";
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ success: false, message: "Authentication token is required." });
  try { req.user = jwt.verify(token, env.jwtSecret) as JwtPayload; next(); }
  catch { return res.status(401).json({ success: false, message: "Your session is invalid or has expired." }); }
}
