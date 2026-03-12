import express from "express"; // The Express framework
import cors from "cors";       // Allows the frontend to make requests to this backend
import dotenv from "dotenv";   // Loads variables from .env into process.env

// Import our route files — each file handles a group of related endpoints
import authRoutes from "./routes/auth";
import workoutRoutes from "./routes/workouts"; // Workout CRUD routes
import statsRoutes from "./routes/stats";       // Dashboard stats routes
import exerciseRoutes from "./routes/exercises"; // Exercises routes

// Load environment variables FIRST before anything else.
// If this runs after other imports, process.env values won't be available in time.
dotenv.config();

// Create the Express app instance.
// This is the object we attach middleware and routes to.
const app = express();

// --- MIDDLEWARE ---
// Middleware runs on every request before it reaches a route handler.
// The order matters — middleware is applied top to bottom.

// CORS (Cross-Origin Resource Sharing)
// By default browsers block requests from a different origin (e.g. localhost:3000 → localhost:5000).
// This tells Express to allow requests from our Next.js frontend.
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000", // Only allow our frontend
  credentials: true, // Allow cookies to be sent with requests (needed for httpOnly cookies later)
}));

// JSON body parser
// Without this, req.body would be undefined.
// This middleware parses incoming JSON payloads and makes them available on req.body.
app.use(express.json());

// --- ROUTES ---
// Mount route files at specific path prefixes.
// Any request to /api/auth/... is handled by authRoutes.
// e.g. POST /api/auth/signup → handled in routes/auth.ts
app.use("/api/auth", authRoutes);
app.use("/api/workouts", workoutRoutes); // Protected workout routes
app.use("/api/stats", statsRoutes);     // Protected stats routes
app.use("/api/exercises", exerciseRoutes); // Protected exercise routes

// --- HEALTH CHECK ---
// A simple GET endpoint to verify the server is running.
// Useful for deployment platforms to check if the app is alive.
// Visit http://localhost:5000/health to test it.
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "FitTrack API is running" });
});

// --- START SERVER ---
// Read the port from .env, fall back to 5000 if not set.
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

export default app;
