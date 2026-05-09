require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'lumio-secret';

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

// ── DATABASE ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      account_type VARCHAR(20) DEFAULT 'student',
      streak_days INT DEFAULT 0,
      total_cards_studied INT DEFAULT 0,
      weekly_score INT DEFAULT 0,
      last_study_date DATE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sets (
      id SERIAL PRIMARY KEY,
      creator_id INT REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT DEFAULT '',
      subject VARCHAR(100) DEFAULT '',
      age_rating VARCHAR(10) DEFAULT 'all',
      difficulty VARCHAR(20) DEFAULT 'beginner',
      is_published BOOLEAN DEFAULT false,
      play_count INT DEFAULT 0,
      avg_rating DECIMAL(3,1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cards (
      id SERIAL PRIMARY KEY,
      set_id INT REFERENCES sets(id) ON DELETE CASCADE,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      position INT DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS study_sessions (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      set_id INT REFERENCES sets(id) ON DELETE CASCADE,
      cards_studied INT DEFAULT 0,
      correct INT DEFAULT 0,
      score DECIMAL(5,2) DEFAULT 0,
      completed_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS saved_sets (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      set_id INT REFERENCES sets(id) ON DELETE CASCADE,
      UNIQUE(user_id, set_id)
    );
    CREATE TABLE IF NOT EXISTS follows (
      id SERIAL PRIMARY KEY,
      follower_id INT REFERENCES users(id) ON DELETE CASCADE,
      following_id INT REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(follower_id, following_id)
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      set_id INT REFERENCES sets(id) ON DELETE CASCADE,
      rating INT CHECK (rating >= 1 AND rating <= 5),
      review_text TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, set_id)
    );
  `);
  console.log('Database ready');
}

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password, accountType = 'student' } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
    const exists = await pool.query('SELECT id FROM users WHERE email=$1 OR username=$2', [email, username]);
    if (exists.rows.length > 0) return res.status(409).json({ error: 'Username or email already taken' });
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (username,email,password_hash,account_type) VALUES ($1,$2,$3,$4) RETURNING id,username,email,account_type',
      [username, email, hash, accountType]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username, accountType: user.account_type }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const result = await pool.query('SELECT * FROM users WHERE email=$1 OR username=$1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, accountType: user.account_type }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, accountType: user.account_type, streakDays: user.streak_days } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id,username,email,account_type,streak_days,total_cards_studied,weekly_score,created_at FROM users WHERE id=$1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SETS ROUTES ───────────────────────────────────────────────────────────────
app.get('/api/sets', async (req, res) => {
  try {
    const { subject, search, sort = 'trending', limit = 20, offset = 0 } = req.query;
    let where = ['s.is_published=true'];
    let params = [];
    let p = 1;
    if (subject) { where.push(`s.subject ILIKE $${p++}`); params.push(`%${subject}%`); }
    if (search) { where.push(`s.title ILIKE $${p++}`); params.push(`%${search}%`); }
    const order = sort === 'newest' ? 's.created_at DESC' : sort === 'top' ? 's.avg_rating DESC' : 's.play_count DESC';
    params.push(limit, offset);
    const result = await pool.query(
      `SELECT s.*,u.username as creator_name,(SELECT COUNT(*) FROM cards WHERE set_id=s.id) as card_count
       FROM sets s JOIN users u ON s.creator_id=u.id WHERE ${where.join(' AND ')}
       ORDER BY ${order} LIMIT $${p++} OFFSET $${p}`, params
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sets/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*,u.username as creator_name FROM sets s JOIN users u ON s.creator_id=u.id WHERE s.id=$1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Set not found' });
    const cards = await pool.query('SELECT * FROM cards WHERE set_id=$1 ORDER BY position', [req.params.id]);
    res.json({ ...result.rows[0], cards: cards.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sets', auth, async (req, res) => {
  try {
    const { title, description, subject, ageRating, difficulty, cards = [], isPublished = false } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const setResult = await pool.query(
      'INSERT INTO sets (creator_id,title,description,subject,age_rating,difficulty,is_published) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.user.id, title, description || '', subject || '', ageRating || 'all', difficulty || 'beginner', isPublished]
    );
    const set = setResult.rows[0];
    if (cards.length > 0) {
      for (let i = 0; i < cards.length; i++) {
        await pool.query('INSERT INTO cards (set_id,front,back,position) VALUES ($1,$2,$3,$4)', [set.id, cards[i].front, cards[i].back, i]);
      }
    }
    res.status(201).json(set);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sets/:id/play', async (req, res) => {
  try {
    await pool.query('UPDATE sets SET play_count=play_count+1 WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sets/:id/review', auth, async (req, res) => {
  try {
    const { rating, reviewText } = req.body;
    await pool.query(
      'INSERT INTO reviews (user_id,set_id,rating,review_text) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,set_id) DO UPDATE SET rating=$3,review_text=$4',
      [req.user.id, req.params.id, rating, reviewText || '']
    );
    const avg = await pool.query('SELECT AVG(rating) as avg FROM reviews WHERE set_id=$1', [req.params.id]);
    await pool.query('UPDATE sets SET avg_rating=$1 WHERE id=$2', [parseFloat(avg.rows[0].avg).toFixed(1), req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── STUDY ROUTES ──────────────────────────────────────────────────────────────
app.post('/api/study/session', auth, async (req, res) => {
  try {
    const { setId, cardsStudied, correct } = req.body;
    const score = cardsStudied > 0 ? Math.round((correct / cardsStudied) * 100) : 0;
    await pool.query(
      'INSERT INTO study_sessions (user_id,set_id,cards_studied,correct,score) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, setId, cardsStudied, correct, score]
    );
    const today = new Date().toISOString().split('T')[0];
    const user = await pool.query('SELECT last_study_date,streak_days FROM users WHERE id=$1', [req.user.id]);
    const u = user.rows[0];
    let newStreak = u.streak_days || 0;
    if (u.last_study_date) {
      const diff = Math.floor((new Date() - new Date(u.last_study_date)) / 86400000);
      if (diff === 1) newStreak++;
      else if (diff > 1) newStreak = 1;
    } else newStreak = 1;
    await pool.query(
      'UPDATE users SET total_cards_studied=total_cards_studied+$1,streak_days=$2,last_study_date=$3,weekly_score=weekly_score+$4 WHERE id=$5',
      [cardsStudied, newStreak, today, score, req.user.id]
    );
    res.json({ success: true, score, newStreak });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id,u.username,u.streak_days,u.weekly_score,u.total_cards_studied,
       COUNT(DISTINCT ss.id) as sessions
       FROM users u LEFT JOIN study_sessions ss ON u.id=ss.user_id
       AND ss.completed_at > NOW() - INTERVAL '7 days'
       GROUP BY u.id ORDER BY u.weekly_score DESC LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SOCIAL ROUTES ─────────────────────────────────────────────────────────────
app.post('/api/social/follow/:userId', auth, async (req, res) => {
  try {
    await pool.query('INSERT INTO follows (follower_id,following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.userId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/social/follow/:userId', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM follows WHERE follower_id=$1 AND following_id=$2', [req.user.id, req.params.userId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/social/save/:setId', auth, async (req, res) => {
  try {
    await pool.query('INSERT INTO saved_sets (user_id,set_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.setId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/social/profile/:username', async (req, res) => {
  try {
    const result = await pool.query('SELECT id,username,streak_days,total_cards_studied,created_at FROM users WHERE username=$1', [req.params.username]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];
    const sets = await pool.query('SELECT id,title,subject,play_count,avg_rating FROM sets WHERE creator_id=$1 AND is_published=true ORDER BY play_count DESC', [user.id]);
    const followers = await pool.query('SELECT COUNT(*) FROM follows WHERE following_id=$1', [user.id]);
    res.json({ ...user, sets: sets.rows, followerCount: parseInt(followers.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── LEO AI PROXY ──────────────────────────────────────────────────────────────
app.post('/api/leo', async (req, res) => {
  try {
    const { system, messages, maxTokens = 1000 } = req.body;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AI not configured' });
    const userMsgs = messages.filter(m => m.role !== 'system');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system: system || 'You are Leo, a helpful AI study coach on Lumio.',
        messages: userMsgs
      })
    });
    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    res.json({ text: data.content?.[0]?.text || '' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  await initDb();
  console.log(`Lumio backend running on port ${PORT}`);
});
