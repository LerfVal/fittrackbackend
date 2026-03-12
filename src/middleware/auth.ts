import { Request, Response, NextFunction } from "express"; // Express TypeScript types
import jwt from "jsonwebtoken";

// Extend Express's Request type to include a "user" property.
// By default, Express doesn't know about "user" on the request object.
// This tells TypeScript that after our middleware runs, req.user will exist.
export interface AuthRequest extends Request {
  user?: {
    id: number;   // The logged-in user's database ID
    email: string;
  };
}

// --- AUTH MIDDLEWARE ---
// This function runs BEFORE protected route handlers.
// It checks the Authorization header for a valid JWT token.
// If valid → attaches the user to req and calls next() to continue.
// If invalid → sends a 401 Unauthorized response and stops the request.
export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {

  // The token is sent in the Authorization header like:
  // "Bearer eyJhbGciOiJIUzI1NiIsInR5..."
  // We split on the space and take the second part (the actual token).
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer <token>" → "<token>"

  // If no token was provided, reject the request immediately
  if (!token) {
    res.status(401).json({ message: "Access denied. No token provided." });
    return;
  }

  try {
    // jwt.verify() checks:
    // 1. The token signature is valid (wasn't tampered with)
    // 2. The token hasn't expired
    // If both pass, it returns the decoded payload we stored when creating the token.
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: number;
      email: string;
    };

    // Attach the decoded user info to the request object.
    // Route handlers can now access req.user.id to know who is making the request.
    req.user = decoded;

    next(); // Everything looks good — continue to the route handler
  } catch (err) {
    // jwt.verify() throws if the token is invalid or expired
    res.status(403).json({ message: "Invalid or expired token." });
  }
};
