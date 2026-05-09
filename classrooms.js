const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const router = express.Router();

// GET /api/classrooms — teacher's classrooms
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM classroom_students WHERE classroom_id = c.id) as student_count,
        (SELECT COUNT(*) FROM assignments WHERE classroom_id = c.id) as assignment_count
       FROM classrooms c WHERE c.teacher_id = $1 ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/classrooms
router.post('/', auth, async (req, res) => {
  try {
    const { name, subject, schedule } = req.body;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const result = await pool.query(
      'INSERT INTO classrooms (teacher_id, name, subject, class_code, schedule) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, name, subject || '', code, schedule || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/classrooms/join — student joins by code
router.post('/join', auth, async (req, res) => {
  try {
    const { code } = req.body;
    const classroom = await pool.query('SELECT * FROM classrooms WHERE class_code = $1', [code.toUpperCase()]);
    if (classroom.rows.length === 0) return res.status(404).json({ error: 'Classroom not found' });
    await pool.query(
      'INSERT INTO classroom_students (classroom_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [classroom.rows[0].id, req.user.id]
    );
    res.json({ success: true, classroom: classroom.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/classrooms/:id/students
router.get('/:id/students', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.streak_days,
        (SELECT AVG(score) FROM study_sessions WHERE user_id = u.id) as avg_score,
        (SELECT COUNT(*) FROM assignment_completions ac
         JOIN assignments a ON ac.assignment_id = a.id
         WHERE ac.student_id = u.id AND a.classroom_id = $1) as assignments_done,
        (SELECT COUNT(*) FROM assignments WHERE classroom_id = $1) as total_assignments,
        (SELECT MAX(completed_at) FROM study_sessions WHERE user_id = u.id) as last_active
       FROM classroom_students cs JOIN users u ON cs.student_id = u.id
       WHERE cs.classroom_id = $1 ORDER BY avg_score DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/classrooms/:id/assignments
router.post('/:id/assignments', auth, async (req, res) => {
  try {
    const { setId, instructions, dueDate } = req.body;
    const result = await pool.query(
      'INSERT INTO assignments (classroom_id, set_id, teacher_id, instructions, due_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.params.id, setId, req.user.id, instructions || '', dueDate || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/classrooms/:id/assignments
router.get('/:id/assignments', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, s.title as set_title,
        (SELECT COUNT(*) FROM assignment_completions WHERE assignment_id = a.id) as completed_count,
        (SELECT COUNT(*) FROM classroom_students WHERE classroom_id = a.classroom_id) as total_students
       FROM assignments a JOIN sets s ON a.set_id = s.id
       WHERE a.classroom_id = $1 ORDER BY a.due_date ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/classrooms/assignments/:id/complete
router.post('/assignments/:id/complete', auth, async (req, res) => {
  try {
    const { score } = req.body;
    await pool.query(
      'INSERT INTO assignment_completions (assignment_id, student_id, score) VALUES ($1, $2, $3) ON CONFLICT (assignment_id, student_id) DO UPDATE SET score = $3',
      [req.params.id, req.user.id, score || 0]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
