import { Router, Response } from "express";
import pool from "../db"; // Database connection pool
import { authenticateToken, AuthRequest } from "../middleware/auth"; // JWT middleware

const router = Router();

// Apply authenticateToken middleware to ALL routes in this file.
// This means every request to /api/workouts/... must include a valid JWT token.
// If the token is missing or invalid, the middleware returns 401 before the route handler runs.
router.use(authenticateToken);

// ── GET ALL WORKOUTS ─────────────────────────────────────────
// GET /api/workouts
// Returns all workouts for the logged in user, ordered by most recent first.
// Each workout also includes the number of sets logged (via a subquery).
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id; // req.user is set by authenticateToken middleware

    const result = await pool.query(
      `SELECT
        w.id,
        w.title,
        w.notes,
        w.completed_at,
        -- Subquery counts how many sets belong to this workout
        COUNT(s.id) AS total_sets
      FROM workouts w
      -- LEFT JOIN means we still return workouts that have 0 sets
      LEFT JOIN sets s ON s.workout_id = w.id
      WHERE w.user_id = $1
      GROUP BY w.id
      ORDER BY w.completed_at DESC`, // Most recent workouts first
      [userId]
    );

    res.status(200).json(result.rows);

  } catch (err) {
    console.error("Get workouts error:", err);
    res.status(500).json({ message: "Failed to fetch workouts." });
  }
});

// ── GET SINGLE WORKOUT ───────────────────────────────────────
// GET /api/workouts/:id
// Returns a single workout with all its exercises and sets.
// This is used when the user clicks into a specific workout to view details.
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const workoutId = parseInt(req.params.id as string, 10); // Convert URL param from string to number

    // Fetch the workout — also verify it belongs to the logged in user
    // This prevents users from accessing other users' workouts by guessing IDs
    const workoutResult = await pool.query(
      "SELECT * FROM workouts WHERE id = $1 AND user_id = $2",
      [workoutId, userId]
    );

    // If no rows returned, the workout doesn't exist or belongs to someone else
    if (workoutResult.rows.length === 0) {
      res.status(404).json({ message: "Workout not found." });
      return;
    }

    // Fetch all sets for this workout, joined with exercise names
    // JOIN lets us get the exercise name without a second query
    const setsResult = await pool.query(
      `SELECT
        s.id,
        s.set_number,
        s.reps,
        s.weight_lbs,
        s.exercise_id,
        e.name AS exercise_name,
        e.muscle_group
      FROM sets s
      JOIN exercises e ON e.id = s.exercise_id
      WHERE s.workout_id = $1
      ORDER BY s.exercise_id, s.set_number`, // Group sets by exercise, ordered by set number
      [workoutId]
    );

    // Return the workout object with its sets nested inside
    res.status(200).json({
      ...workoutResult.rows[0], // Spread workout fields
      sets: setsResult.rows,    // Attach the sets array
    });

  } catch (err) {
    console.error("Get workout error:", err);
    res.status(500).json({ message: "Failed to fetch workout." });
  }
});

// ── CREATE WORKOUT ───────────────────────────────────────────
// POST /api/workouts
// Creates a new workout with all its sets in a single request.
// Accepts: { title, notes, sets: [{ exercise_id, set_number, reps, weight_lbs }] }
// Returns: the created workout with its sets
router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { title, notes, sets } = req.body;

  // Validate required fields
  if (!title) {
    res.status(400).json({ message: "Workout title is required." });
    return;
  }

  if (!sets || !Array.isArray(sets) || sets.length === 0) {
    res.status(400).json({ message: "At least one set is required." });
    return;
  }

  // --- DATABASE TRANSACTION ---
  // A transaction groups multiple queries so they either ALL succeed or ALL fail.
  // This prevents partial data — e.g. workout created but sets failed to insert.
  // We get a client from the pool to run the transaction on a single connection.
  const client = await pool.connect();

  try {
    await client.query("BEGIN"); // Start the transaction

    // Insert the workout row first — we need its ID for the sets
    const workoutResult = await client.query(
      `INSERT INTO workouts (user_id, title, notes)
       VALUES ($1, $2, $3)
       RETURNING *`, // Return the full row including the generated ID
      [userId, title, notes || null]
    );

    const workout = workoutResult.rows[0];

    // Insert each set, referencing the new workout's ID
    // We build this as a loop — one INSERT per set
    const insertedSets = [];
    for (const set of sets) {
      const setResult = await client.query(
        `INSERT INTO sets (workout_id, exercise_id, set_number, reps, weight_lbs)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [workout.id, set.exercise_id, set.set_number, set.reps, set.weight_lbs]
      );
      insertedSets.push(setResult.rows[0]);
    }

    await client.query("COMMIT"); // All queries succeeded — save to database

    // Return the full workout with its sets
    res.status(201).json({
      ...workout,
      sets: insertedSets,
    });

  } catch (err) {
    await client.query("ROLLBACK"); // Something failed — undo everything
    console.error("Create workout error:", err);
    res.status(500).json({ message: "Failed to create workout." });
  } finally {
    client.release(); // Always return the client to the pool
  }
});

// ── DELETE WORKOUT ───────────────────────────────────────────
// DELETE /api/workouts/:id
// Deletes a workout and all its sets.
// Sets are deleted automatically because of ON DELETE CASCADE in the schema.
router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const workoutId = parseInt(req.params.id as string, 10);
    // Delete only if the workout belongs to the logged in user
    // This prevents users from deleting other users' workouts
    const result = await pool.query(
      "DELETE FROM workouts WHERE id = $1 AND user_id = $2 RETURNING id",
      [workoutId, userId]
    );

    // If nothing was deleted, the workout didn't exist or wasn't theirs
    if (result.rows.length === 0) {
      res.status(404).json({ message: "Workout not found." });
      return;
    }

    // 204 = "No Content" — standard response for successful DELETE with no body
    res.status(204).send();

  } catch (err) {
    console.error("Delete workout error:", err);
    res.status(500).json({ message: "Failed to delete workout." });
  }
});

export default router;
