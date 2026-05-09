const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const router = express.Router();

// ── LEADERBOARD ───────────────────────────────────────────────────────────────

// GET /api/leaderboard?type=studied&period=weekly
router.get('/', async (req, res) => {
  try {
    const { type = 'studied', period = 'weekly', limit = 50 } = req.query;

    const queries = {
      studied: `SELECT u.id, u.username, u.verified, u.streak_days,
          SUM(ss.cards_studied) as score,
          COUNT(DISTINCT ss.id) as sessions
         FROM users u JOIN study_sessions ss ON u.id = ss.user_id
         WHERE ss.completed_at > NOW() - INTERVAL '7 days'
         GROUP BY u.id ORDER BY score DESC LIMIT $1`,
      accuracy: `SELECT u.id, u.username, u.verified,
          AVG(ss.score) as score,
          COUNT(DISTINCT ss.id) as sessions
         FROM users u JOIN study_sessions ss ON u.id = ss.user_id
         WHERE ss.completed_at > NOW() - INTERVAL '7 days'
         GROUP BY u.id HAVING COUNT(*) >= 3 ORDER BY score DESC LIMIT $1`,
      streak: `SELECT id, username, verified, streak_days as score, total_cards_studied
         FROM users WHERE streak_days > 0 ORDER BY streak_days DESC LIMIT $1`,
      creators: `SELECT u.id, u.username, u.verified, u.total_sets_published,
          SUM(s.play_count) as score,
          AVG(s.avg_rating) as avg_rating
         FROM users u JOIN sets s ON u.id = s.creator_id
         WHERE s.is_published = true
         GROUP BY u.id ORDER BY score DESC LIMIT $1`,
    };

    const query = queries[type] || queries.studied;
    const result = await pool.query(query, [limit]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SOCIAL ────────────────────────────────────────────────────────────────────

// POST /api/social/follow/:userId
router.post('/follow/:userId', auth, async (req, res) => {
  try {
    if (parseInt(req.params.userId) === req.user.id)
      return res.status(400).json({ error: 'Cannot follow yourself' });
    await pool.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.userId]
    );
    res.json({ success: true, following: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/social/follow/:userId
router.delete('/follow/:userId', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM follows WHERE follower_id = $1 AND following_id = $2', [req.user.id, req.params.userId]);
    res.json({ success: true, following: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/followers/:userId
router.get('/followers/:userId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.verified FROM follows f
       JOIN users u ON f.follower_id = u.id WHERE f.following_id = $1`,
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/social/save/:setId
router.post('/save/:setId', auth, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO saved_sets (user_id, set_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.setId]
    );
    res.json({ success: true, saved: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/social/save/:setId
router.delete('/save/:setId', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM saved_sets WHERE user_id = $1 AND set_id = $2', [req.user.id, req.params.setId]);
    res.json({ success: true, saved: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/saved
router.get('/saved', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.username as creator_name,
        (SELECT COUNT(*) FROM cards WHERE set_id = s.id) as card_count
       FROM saved_sets ss JOIN sets s ON ss.set_id = s.id JOIN users u ON s.creator_id = u.id
       WHERE ss.user_id = $1 ORDER BY ss.saved_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/social/profile/:username
router.get('/profile/:username', async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT id, username, bio, location, verified, streak_days, total_cards_studied, total_sets_published, created_at
       FROM users WHERE username = $1`,
      [req.params.username]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];

    const sets = await pool.query(
      `SELECT s.id, s.title, s.subject, s.play_count, s.avg_rating,
        (SELECT COUNT(*) FROM cards WHERE set_id = s.id) as card_count
       FROM sets s WHERE s.creator_id = $1 AND s.is_published = true ORDER BY s.play_count DESC`,
      [user.id]
    );
    const followers = await pool.query('SELECT COUNT(*) FROM follows WHERE following_id = $1', [user.id]);
    const badges = await pool.query('SELECT badge_type, earned_at FROM badges WHERE user_id = $1', [user.id]);

    res.json({ ...user, sets: sets.rows, followerCount: parseInt(followers.rows[0].count), badges: badges.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
