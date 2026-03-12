import { Router, Request, Response } from "express"; // Router lets us group related routes
import bcrypt from "bcryptjs"; // For hashing and comparing passwords
import jwt from "jsonwebtoken"; // For creating and verifying tokens
import pool from "../db"; // Our database connection pool

// Create a Router instance — this groups all auth routes together.
// We'll mount this on "/api/auth" in index.ts, so:
// POST /api/auth/signup → signup handler
// POST /api/auth/login  → login handler
const router = Router();

// ── SIGNUP ──────────────────────────────────────────────────
// POST /api/auth/signup
// Accepts: { name, email, password }
// Returns: { token, user: { id, name, email } }
router.post("/signup", async (req: Request, res: Response): Promise<void> => {
  // Destructure the request body — this is what the frontend sends
  const { name, email, password } = req.body;

  // --- VALIDATION ---
  // Always validate on the backend too, even if the frontend already validates.
  // Someone could bypass the frontend and hit the API directly.
  if (!name || !email || !password) {
    res.status(400).json({ message: "All fields are required." });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ message: "Password must be at least 8 characters." });
    return;
  }

  try {
    // --- CHECK IF EMAIL ALREADY EXISTS ---
    // We query the database before trying to insert.
    // The $1 is a parameterized query — it safely escapes the value to prevent SQL injection.
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      res.status(409).json({ message: "An account with this email already exists." });
      return;
    }

    // --- HASH THE PASSWORD ---
    // NEVER store plain text passwords in the database.
    // bcrypt.hash() turns "mypassword123" into something like "$2b$10$X9k..."
    // The 10 is the "salt rounds" — higher = more secure but slower. 10 is the standard.
    const passwordHash = await bcrypt.hash(password, 10);

    // --- INSERT NEW USER INTO DATABASE ---
    // RETURNING * tells PostgreSQL to return the newly created row immediately.
    // This saves us a second query to fetch the user after inserting.
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at",
      [name, email, passwordHash]
    );

    const newUser = result.rows[0]; // The newly created user row

    // --- CREATE JWT TOKEN ---
    // We sign a payload containing the user's id and email.
    // This token is sent to the frontend and included in future requests to prove identity.
    // expiresIn: "7d" means the token is valid for 7 days before they need to log in again.
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email }, // Payload — what we store in the token
      process.env.JWT_SECRET as string,          // Secret key — used to sign and verify
      { expiresIn: "7d" }                        // Token expiry
    );

    // --- SEND RESPONSE ---
    // 201 = "Created" — the standard status code for successful resource creation
    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
      },
    });

  } catch (err) {
    // Catch any unexpected database errors
    console.error("Signup error:", err);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
});

// ── LOGIN ────────────────────────────────────────────────────
// POST /api/auth/login
// Accepts: { email, password }
// Returns: { token, user: { id, name, email } }
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  // --- VALIDATION ---
  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required." });
    return;
  }

  try {
    // --- FIND USER BY EMAIL ---
    // Look up the user in the database by their email address
    const result = await pool.query(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [email]
    );

    const user = result.rows[0];

    // --- CHECK IF USER EXISTS ---
    // Important: we give the same vague error whether the email OR password is wrong.
    // This prevents "user enumeration" — an attacker finding out which emails are registered.
    if (!user) {
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    // --- COMPARE PASSWORD ---
    // bcrypt.compare() hashes the entered password and compares it to the stored hash.
    // We never "decrypt" the hash — bcrypt is one-way. We just compare hashes.
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    // --- CREATE JWT TOKEN ---
    // Same process as signup — create a signed token with the user's info
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    // --- SEND RESPONSE ---
    // 200 = "OK" — standard success status
    res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
});

export default router; // Export so we can mount it in index.ts
