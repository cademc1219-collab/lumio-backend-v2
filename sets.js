const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const router = express.Router();

// GET /api/sets — browse published sets
router.get('/', async (req, res) => {
  try {
    const { subject, age, sort = 'trending', limit = 20, offset = 0, search } = req.query;
    let where = ['s.is_published = true'];
    let params = [];
    let p = 1;

    if (subject) { where.push(`s.subject ILIKE $${p++}`); params.push(`%${subject}%`); }
    if (age) { where.push(`s.age_rating = $${p++}`); params.push(age); }
    if (search) { where.push(`(s.title ILIKE $${p++} OR s.description ILIKE $${p++})`); params.push(`%${search}%`, `%${search}%`); p++; }

    const orderMap = { trending: 's.play_count DESC', top: 's.avg_rating DESC', newest: 's.created_at DESC', studied: 's.play_count DESC' };
    const order = orderMap[sort] || 's.play_count DESC';

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT s.*, u.username as creator_name, u.verified as creator_verified,
        (SELECT COUNT(*) FROM cards WHERE set_id = s.id) as card_count
       FROM sets s JOIN users u ON s.creator_id = u.id
       WHERE ${where.join(' AND ')}
       ORDER BY ${order} LIMIT $${p++} OFFSET $${p}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sets/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.username as creator_name, u.verified as creator_verified, u.bio as creator_bio,
        (SELECT COUNT(*) FROM cards WHERE set_id = s.id) as card_count,
        (SELECT COUNT(*) FROM follows WHERE following_id = s.creator_id) as creator_followers
       FROM sets s JOIN users u ON s.creator_id = u.id WHERE s.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Set not found' });

    const cards = await pool.query('SELECT * FROM cards WHERE set_id = $1 ORDER BY position', [req.params.id]);
    res.json({ ...result.rows[0], cards: cards.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sets — create set
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, subject, ageRating, difficulty, cards = [], isPublished = false } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const setResult = await pool.query(
      `INSERT INTO sets (creator_id, title, description, subject, age_rating, difficulty, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, title, description, subject, ageRating || 'all', difficulty || 'beginner', isPublished]
    );
    const set = setResult.rows[0];

    if (cards.length > 0) {
      const cardValues = cards.map((c, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3}, ${i})`).join(',');
      const cardParams = [set.id, ...cards.flatMap(c => [c.front, c.back])];
      await pool.query(`INSERT INTO cards (set_id, front, back, position) VALUES ${cardValues}`, cardParams);
    }

    if (isPublished) {
      await pool.query('UPDATE users SET total_sets_published = total_sets_published + 1 WHERE id = $1', [req.user.id]);
    }

    res.status(201).json(set);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/sets/:id
router.patch('/:id', auth, async (req, res) => {
  try {
    const { title, description, subject, ageRating, difficulty, isPublished, cards } = req.body;
    const check = await pool.query('SELECT creator_id FROM sets WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Set not found' });
    if (check.rows[0].creator_id !== req.user.id) return res.status(403).json({ error: 'Not your set' });

    const result = await pool.query(
      `UPDATE sets SET title = COALESCE($1, title), description = COALESCE($2, description),
       subject = COALESCE($3, subject), age_rating = COALESCE($4, age_rating),
       difficulty = COALESCE($5, difficulty), is_published = COALESCE($6, is_published)
       WHERE id = $7 RETURNING *`,
      [title, description, subject, ageRating, difficulty, isPublished, req.params.id]
    );

    if (cards) {
      await pool.query('DELETE FROM cards WHERE set_id = $1', [req.params.id]);
      if (cards.length > 0) {
        const vals = cards.map((c, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3}, ${i})`).join(',');
        await pool.query(`INSERT INTO cards (set_id, front, back, position) VALUES ${vals}`, [req.params.id, ...cards.flatMap(c => [c.front, c.back])]);
      }
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sets/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const check = await pool.query('SELECT creator_id FROM sets WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Set not found' });
    if (check.rows[0].creator_id !== req.user.id) return res.status(403).json({ error: 'Not your set' });
    await pool.query('DELETE FROM sets WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sets/:id/play — record a play
router.post('/:id/play', async (req, res) => {
  try {
    await pool.query('UPDATE sets SET play_count = play_count + 1 WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sets/:id/review
router.post('/:id/review', auth, async (req, res) => {
  try {
    const { rating, reviewText } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });

    await pool.query(
      `INSERT INTO reviews (user_id, set_id, rating, review_text) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, set_id) DO UPDATE SET rating = $3, review_text = $4`,
      [req.user.id, req.params.id, rating, reviewText || '']
    );

    const avg = await pool.query('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE set_id = $1', [req.params.id]);
    await pool.query('UPDATE sets SET avg_rating = $1, rating_count = $2 WHERE id = $3',
      [parseFloat(avg.rows[0].avg).toFixed(1), avg.rows[0].count, req.params.id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sets/:id/reviews
router.get('/:id/reviews', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.username FROM reviews r JOIN users u ON r.user_id = u.id
       WHERE r.set_id = $1 ORDER BY r.created_at DESC LIMIT 20`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
