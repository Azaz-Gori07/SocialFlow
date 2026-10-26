import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { resolveApiKey } from '../shared/middleware/apiKeyAuth';

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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: (process.env.JWT_EXPIRES_IN as any) || '7d' });
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

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const rawHeaderKey = req.headers['x-api-key'];
  const headerApiKey = Array.isArray(rawHeaderKey) ? rawHeaderKey[0] : rawHeaderKey;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const apiKey = headerApiKey || (bearerToken?.startsWith('sf_live_') ? bearerToken : null);

  if (apiKey) {
    try {
      const identity = await resolveApiKey(apiKey);
      if (!identity) {
        return res.status(401).json({ message: 'Invalid workspace API key' });
      }
      req.user = { id: identity.userId, email: identity.email };
      (req as any).apiKeyWorkspaceId = identity.workspaceId;
      return next();
    } catch (error) {
      console.error('API key authentication error:', error);
      return res.status(401).json({ message: 'Invalid workspace API key' });
    }
  }

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
