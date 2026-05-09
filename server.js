require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db/pool');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sets', require('./routes/sets'));
app.use('/api/study', require('./routes/study'));
app.use('/api/social', require('./routes/social'));
app.use('/api/classrooms', require('./routes/classrooms'));
app.use('/api/leo', require('./routes/leo'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Run DB schema on startup
async function initDb() {
  try {
    const schema = fs.readFileSync('./db/schema.sql', 'utf8');
    await pool.query(schema);
    console.log('Database schema ready');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
}

app.listen(PORT, async () => {
  await initDb();
  console.log(`Lumio backend running on port ${PORT}`);
});
