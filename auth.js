const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'lumio-secret-key';

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password, accountType = 'student' } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'Username, email and password are required' });

    const exists = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    if (exists.rows.length > 0)
      return res.status(409).json({ error: 'Username or email already taken' });

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, account_type)
       VALUES ($1, $2, $3, $4) RETURNING id, username, email, account_type`,
      [username, email, hash, accountType]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username, accountType: user.account_type }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR username = $1',
      [email]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Invalid email or password' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id, username: user.username, accountType: user.account_type }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, accountType: user.account_type, bio: user.bio, streakDays: user.streak_days } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, account_type, bio, location, verified, streak_days, total_cards_studied, total_sets_published, weekly_score, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/me
router.patch('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const { bio, location, username } = req.body;
    const result = await pool.query(
      'UPDATE users SET bio = COALESCE($1, bio), location = COALESCE($2, location), username = COALESCE($3, username) WHERE id = $4 RETURNING id, username, bio, location',
      [bio, location, username, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
