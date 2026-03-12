import { Router, Response } from "express";
import pool from "../db";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();

// Protect all exercise routes with JWT middleware
router.use(authenticateToken);

// ── GET ALL EXERCISES ────────────────────────────────────────
// GET /api/exercises
// Returns all exercises from the database, ordered alphabetically.
// Used to power the exercise search in the workout logger.
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, name, muscle_group, equipment
       FROM exercises
       ORDER BY name ASC` // Alphabetical order makes searching easier
    );

    res.status(200).json(result.rows);

  } catch (err) {
    console.error("Get exercises error:", err);
    res.status(500).json({ message: "Failed to fetch exercises." });
  }
});

// ── GET SINGLE EXERCISE ──────────────────────────────────────
// GET /api/exercises/:id
// Returns a single exercise by ID.
// Used when loading progress charts for a specific exercise.
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const exerciseId = parseInt(req.params.id as string, 10);

    const result = await pool.query(
      "SELECT * FROM exercises WHERE id = $1",
      [exerciseId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: "Exercise not found." });
      return;
    }

    res.status(200).json(result.rows[0]);

  } catch (err) {
    console.error("Get exercise error:", err);
    res.status(500).json({ message: "Failed to fetch exercise." });
  }
});

export default router;
