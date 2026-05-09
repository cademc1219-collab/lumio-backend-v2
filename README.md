# Lumio Backend v2 — Full Database Backend

## What this does
- Real user accounts with login/signup
- Sets saved to PostgreSQL database
- Study sessions tracked and saved
- Real leaderboard from actual data
- Follow creators, save sets
- Teacher classrooms and assignments
- Parent controls
- Leo AI proxied through server (keeps API key safe)

## Setup (10 minutes)

### Step 1 — Free PostgreSQL database
1. Go to **neon.tech** (free, no card needed)
2. Create a new project called "lumio"
3. Copy the connection string — looks like: `postgresql://user:pass@host/lumio`

### Step 2 — Deploy backend
1. Push this folder to a GitHub repo called `lumio-backend-v2`
2. Go to **render.com** → New → Web Service → connect the repo
3. Set these environment variables in Render:
   - `DATABASE_URL` — your Neon connection string
   - `JWT_SECRET` — any long random string (e.g. `lumio-super-secret-2024`)
   - `ANTHROPIC_API_KEY` — your Anthropic key
4. Deploy — takes about 2 minutes
5. Copy your Render URL e.g. `https://lumio-backend-v2.onrender.com`

### Step 3 — Connect frontend
1. Open `api.js` in your lumio website folder
2. Change this line:
   ```
   const LUMIO_API_URL = 'YOUR_BACKEND_URL';
   ```
   to your Render URL:
   ```
   const LUMIO_API_URL = 'https://lumio-backend-v2.onrender.com';
   ```
3. Upload all files to GitHub Pages

## That's it!
Users can now sign up, log in, create sets that save permanently, track study progress, follow each other, and everything persists in the real database.

## API Endpoints
- POST /api/auth/signup
- POST /api/auth/login
- GET  /api/auth/me
- GET  /api/sets
- POST /api/sets
- GET  /api/sets/:id
- POST /api/sets/:id/review
- POST /api/study/session
- GET  /api/social/leaderboard
- POST /api/social/follow/:userId
- POST /api/social/save/:setId
- GET  /api/classrooms
- POST /api/classrooms
- POST /api/classrooms/join
- POST /api/leo
