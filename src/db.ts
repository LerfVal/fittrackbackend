import { Pool } from "pg"; // Pool manages multiple database connections efficiently
import dotenv from "dotenv";

dotenv.config(); // Load environment variables from .env file into process.env

// A "Pool" is a collection of reusable database connections.
// Instead of opening a new connection for every request (slow),
// a pool keeps several connections open and reuses them.
// This is the standard way to connect to PostgreSQL in Node.js.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Pulled from your .env file

  // SSL is required for Supabase connections.
  // rejectUnauthorized: false allows self-signed certificates (needed for Supabase).
  ssl: {
    rejectUnauthorized: false,
  },
});

// Test the connection when the server starts.
// This gives you an immediate error in the terminal if your DATABASE_URL is wrong.
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Database connection error:", err.message);
    return;
  }
  console.log("✅ Connected to Supabase PostgreSQL");
  release(); // Release the client back to the pool after the test
});

// Export the pool so any route file can import and use it to run queries.
// Usage in a route: const result = await pool.query("SELECT * FROM users");
export default pool;
