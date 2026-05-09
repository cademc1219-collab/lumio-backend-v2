const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const router = express.Router();

// ── STUDY SESSIONS ────────────────────────────────────────────────────────────

// POST /api/study/session — save a completed session
router.post('/session', auth, async (req, res) => {
  try {
    const { setId, mode, cardsStudied, correct, wrong, durationSeconds } = req.body;
    const score = cardsStudied > 0 ? Math.round((correct / cardsStudied) * 100) : 0;

    await pool.query(
      `INSERT INTO study_sessions (user_id, set_id, mode, cards_studied, correct, wrong, score, duration_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [req.user.id, setId, mode, cardsStudied, correct, wrong, score, durationSeconds || 0]
    );

    // Update user stats + streak
    const today = new Date().toISOString().split('T')[0];
    const user = await pool.query('SELECT last_study_date, streak_days FROM users WHERE id = $1', [req.user.id]);
    const u = user.rows[0];
    let newStreak = u.streak_days;
    if (u.last_study_date) {
      const last = new Date(u.last_study_date);
      const diff = Math.floor((new Date() - last) / (1000 * 60 * 60 * 24));
      if (diff === 1) newStreak += 1;
      else if (diff > 1) newStreak = 1;
    } else {
      newStreak = 1;
    }

    await pool.query(
      `UPDATE users SET total_cards_studied = total_cards_studied + $1,
       streak_days = $2, last_study_date = $3, weekly_score = weekly_score + $4
       WHERE id = $5`,
      [cardsStudied, newStreak, today, score, req.user.id]
    );

    // Award badges
    const totalCards = await pool.query('SELECT total_cards_studied FROM users WHERE id = $1', [req.user.id]);
    const total = totalCards.rows[0].total_cards_studied;
    const milestones = [100, 500, 1000, 5000];
    for (const m of milestones) {
      if (total >= m) {
        await pool.query(
          `INSERT INTO badges (user_id, badge_type) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [req.user.id, `cards_${m}`]
        ).catch(() => {});
      }
    }
    if (newStreak >= 5) {
      await pool.query(`INSERT INTO badges (user_id, badge_type) VALUES ($1, 'streak_5') ON CONFLICT DO NOTHING`, [req.user.id]).catch(() => {});
    }

    res.json({ success: true, score, newStreak });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/study/history — user's study history
router.get('/history', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ss.*, s.title as set_title FROM study_sessions ss
       JOIN sets s ON ss.set_id = s.id
       WHERE ss.user_id = $1 ORDER BY ss.completed_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
