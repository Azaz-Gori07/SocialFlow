import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Secrets must be provided via environment variables; no defaults allowed for security
if (!process.env.JWT_SECRET) {
  console.error('❌ Missing JWT_SECRET environment variable');
  process.exit(1);
}
if (!process.env.JWT_REFRESH_SECRET) {
  console.error('❌ Missing JWT_REFRESH_SECRET environment variable');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export function generateAccessToken(payload: { id: string; email: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

export function generateRefreshToken(payload: { id: string; email: string }): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '30d' });
}

export function verifyRefreshToken(token: string): { id: string; email: string } | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as { id: string; email: string };
  } catch (error) {
    return null;
  }
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn(`🔐 Unauthorized access attempt to ${req.path} - missing token`);
    return res.status(401).json({ message: 'Authorization token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    req.user = decoded;
    next();
  } catch (error) {
    console.warn(`🔐 Invalid/expired token for ${req.path}:`, error);
    return res.status(401).json({ message: 'Invalid or expired access token' });
  }
}
