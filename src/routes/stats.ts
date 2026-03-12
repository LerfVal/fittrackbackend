import { Router, Response } from "express";
import pool from "../db";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();

// Protect all stats routes with JWT middleware
router.use(authenticateToken);

// ── DASHBOARD SUMMARY ────────────────────────────────────────
// GET /api/stats/summary
// Returns high level stats for the dashboard stat cards:
// - Total workouts this month
// - Total volume (lbs) this month
// - Current streak (consecutive days with a workout)
// - Average workout duration (estimated from sets count)
router.get("/summary", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // --- WORKOUTS THIS MONTH ---
    // COUNT how many workouts the user logged in the current calendar month
    const workoutsResult = await pool.query(
      `SELECT COUNT(*) AS total_workouts
       FROM workouts
       WHERE user_id = $1
       AND DATE_TRUNC('month', completed_at) = DATE_TRUNC('month', NOW())`,
      [userId]
    );

    // --- TOTAL VOLUME THIS MONTH ---
    // SUM of (weight_lbs * reps) for all sets this month
    // This is the standard definition of "volume" in strength training
    const volumeResult = await pool.query(
      `SELECT COALESCE(SUM(s.weight_lbs * s.reps), 0) AS total_volume
       FROM sets s
       JOIN workouts w ON w.id = s.workout_id
       WHERE w.user_id = $1
       AND DATE_TRUNC('month', w.completed_at) = DATE_TRUNC('month', NOW())`,
      [userId]
    );

    // --- CURRENT STREAK ---
    // Count consecutive days ending today that have at least one workout.
    // We fetch all distinct workout dates and calculate the streak in JavaScript
    // since this logic is easier to express in JS than SQL.
    const datesResult = await pool.query(
      `SELECT DISTINCT DATE(completed_at) AS workout_date
       FROM workouts
       WHERE user_id = $1
       ORDER BY workout_date DESC`,
      [userId]
    );

    // Calculate streak from the array of dates
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to midnight for date comparison

    for (let i = 0; i < datesResult.rows.length; i++) {
      const workoutDate = new Date(datesResult.rows[i].workout_date);
      workoutDate.setHours(0, 0, 0, 0);

      // Expected date is today minus i days
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() - i);

      // If the workout date matches the expected date, extend the streak
      if (workoutDate.getTime() === expectedDate.getTime()) {
        streak++;
      } else {
        break; // Streak is broken — stop counting
      }
    }

    // --- TOTAL SETS (used for avg duration estimate) ---
    const setsResult = await pool.query(
      `SELECT COUNT(*) AS total_sets
       FROM sets s
       JOIN workouts w ON w.id = s.workout_id
       WHERE w.user_id = $1
       AND DATE_TRUNC('month', w.completed_at) = DATE_TRUNC('month', NOW())`,
      [userId]
    );

    // Estimate avg duration: assume ~3 minutes per set as a rough approximation
    const totalSets = parseInt(setsResult.rows[0].total_sets);
    const totalWorkouts = parseInt(workoutsResult.rows[0].total_workouts);
    const avgDuration = totalWorkouts > 0
      ? Math.round((totalSets * 3) / totalWorkouts)
      : 0;

    // Send all stats in a single response object
    res.status(200).json({
      totalWorkouts,
      totalVolume: Math.round(parseFloat(volumeResult.rows[0].total_volume)),
      streak,
      avgDuration,
    });

  } catch (err) {
    console.error("Stats summary error:", err);
    res.status(500).json({ message: "Failed to fetch stats." });
  }
});

// ── EXERCISE PROGRESS ────────────────────────────────────────
// GET /api/stats/progress/:exerciseId
// Returns the max weight lifted for a specific exercise over time.
// Used to power the progress line chart on the dashboard and progress page.
router.get("/progress/:exerciseId", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const exerciseId = parseInt(req.params.exerciseId as string, 10);

    // For each workout date, find the heaviest set for this exercise
    // This shows the user's "top set" progression over time
    const result = await pool.query(
      `SELECT
        DATE(w.completed_at) AS date,
        MAX(s.weight_lbs) AS max_weight 
       FROM sets s
       JOIN workouts w ON w.id = s.workout_id
       WHERE w.user_id = $1
       AND s.exercise_id = $2
       GROUP BY DATE(w.completed_at)     
       ORDER BY date ASC`,               
      [userId, exerciseId]
    );

    res.status(200).json(result.rows);

  } catch (err) {
    console.error("Progress error:", err);
    res.status(500).json({ message: "Failed to fetch progress data." });
  }
});

export default router;
