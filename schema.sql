-- ── LUMIO DATABASE SCHEMA ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  account_type VARCHAR(20) DEFAULT 'student',
  avatar_emoji VARCHAR(10) DEFAULT '🦁',
  bio TEXT DEFAULT '',
  location VARCHAR(100) DEFAULT '',
  verified BOOLEAN DEFAULT false,
  streak_days INT DEFAULT 0,
  last_study_date DATE,
  total_cards_studied INT DEFAULT 0,
  total_sets_published INT DEFAULT 0,
  weekly_score INT DEFAULT 0,
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
  is_leo_verified BOOLEAN DEFAULT false,
  leo_rating DECIMAL(3,1) DEFAULT 0,
  play_count INT DEFAULT 0,
  avg_rating DECIMAL(3,1) DEFAULT 0,
  rating_count INT DEFAULT 0,
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
  mode VARCHAR(30) DEFAULT 'flip',
  cards_studied INT DEFAULT 0,
  correct INT DEFAULT 0,
  wrong INT DEFAULT 0,
  score DECIMAL(5,2) DEFAULT 0,
  duration_seconds INT DEFAULT 0,
  completed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS follows (
  id SERIAL PRIMARY KEY,
  follower_id INT REFERENCES users(id) ON DELETE CASCADE,
  following_id INT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS saved_sets (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  set_id INT REFERENCES sets(id) ON DELETE CASCADE,
  saved_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, set_id)
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

CREATE TABLE IF NOT EXISTS classrooms (
  id SERIAL PRIMARY KEY,
  teacher_id INT REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(100) DEFAULT '',
  class_code VARCHAR(20) UNIQUE NOT NULL,
  schedule VARCHAR(100) DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classroom_students (
  id SERIAL PRIMARY KEY,
  classroom_id INT REFERENCES classrooms(id) ON DELETE CASCADE,
  student_id INT REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(classroom_id, student_id)
);

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  classroom_id INT REFERENCES classrooms(id) ON DELETE CASCADE,
  set_id INT REFERENCES sets(id) ON DELETE CASCADE,
  teacher_id INT REFERENCES users(id),
  instructions TEXT DEFAULT '',
  due_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_completions (
  id SERIAL PRIMARY KEY,
  assignment_id INT REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INT REFERENCES users(id) ON DELETE CASCADE,
  score DECIMAL(5,2) DEFAULT 0,
  completed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS parent_children (
  id SERIAL PRIMARY KEY,
  parent_id INT REFERENCES users(id) ON DELETE CASCADE,
  child_id INT REFERENCES users(id) ON DELETE CASCADE,
  require_approval BOOLEAN DEFAULT true,
  leo_chat_enabled BOOLEAN DEFAULT true,
  max_age_rating VARCHAR(10) DEFAULT 'all',
  UNIQUE(parent_id, child_id)
);

CREATE TABLE IF NOT EXISTS badges (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  badge_type VARCHAR(50) NOT NULL,
  earned_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sets_creator ON sets(creator_id);
CREATE INDEX IF NOT EXISTS idx_sets_published ON sets(is_published);
CREATE INDEX IF NOT EXISTS idx_cards_set ON cards(set_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON study_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_set ON study_sessions(set_id);
CREATE INDEX IF NOT EXISTS idx_reviews_set ON reviews(set_id);
