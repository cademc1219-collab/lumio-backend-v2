// ── LUMIO API CLIENT ─────────────────────────────────────────────────────────
// Include this in any page that needs real data
// Set LUMIO_API_URL to your backend URL

const LUMIO_API_URL = 'https://lumio-backend-1.onrender.com'; // e.g. https://lumio-backend.onrender.com

class LumioAPI {
  constructor() {
    this.token = localStorage.getItem('lumio_token');
    this.user = JSON.parse(localStorage.getItem('lumio_user') || 'null');
  }

  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  async request(method, path, body) {
    try {
      const res = await fetch(LUMIO_API_URL + path, {
        method,
        headers: this.headers(),
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    } catch (err) {
      console.error(`API ${method} ${path}:`, err.message);
      throw err;
    }
  }

  // ── AUTH ──────────────────────────────────────────────────────────────────
  async signup(username, email, password, accountType) {
    const data = await this.request('POST', '/api/auth/signup', { username, email, password, accountType });
    this.token = data.token;
    this.user = data.user;
    localStorage.setItem('lumio_token', data.token);
    localStorage.setItem('lumio_user', JSON.stringify(data.user));
    return data;
  }

  async login(email, password) {
    const data = await this.request('POST', '/api/auth/login', { email, password });
    this.token = data.token;
    this.user = data.user;
    localStorage.setItem('lumio_token', data.token);
    localStorage.setItem('lumio_user', JSON.stringify(data.user));
    return data;
  }

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('lumio_token');
    localStorage.removeItem('lumio_user');
    window.location.href = 'login.html';
  }

  isLoggedIn() { return !!this.token; }

  async me() { return this.request('GET', '/api/auth/me'); }

  async updateProfile(data) { return this.request('PATCH', '/api/auth/me', data); }

  // ── SETS ──────────────────────────────────────────────────────────────────
  async getSets(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request('GET', `/api/sets${q ? '?' + q : ''}`);
  }

  async getSet(id) { return this.request('GET', `/api/sets/${id}`); }

  async createSet(data) { return this.request('POST', '/api/sets', data); }

  async updateSet(id, data) { return this.request('PATCH', `/api/sets/${id}`, data); }

  async deleteSet(id) { return this.request('DELETE', `/api/sets/${id}`); }

  async recordPlay(setId) { return this.request('POST', `/api/sets/${setId}/play`); }

  async reviewSet(setId, rating, reviewText) {
    return this.request('POST', `/api/sets/${setId}/review`, { rating, reviewText });
  }

  async getReviews(setId) { return this.request('GET', `/api/sets/${setId}/reviews`); }

  // ── STUDY ─────────────────────────────────────────────────────────────────
  async saveSession(data) { return this.request('POST', '/api/study/session', data); }

  async getHistory() { return this.request('GET', '/api/study/history'); }

  // ── LEADERBOARD ───────────────────────────────────────────────────────────
  async getLeaderboard(type = 'studied', period = 'weekly') {
    return this.request('GET', `/api/social?type=${type}&period=${period}`);
  }

  // ── SOCIAL ────────────────────────────────────────────────────────────────
  async follow(userId) { return this.request('POST', `/api/social/follow/${userId}`); }

  async unfollow(userId) { return this.request('DELETE', `/api/social/follow/${userId}`); }

  async saveSet(setId) { return this.request('POST', `/api/social/save/${setId}`); }

  async unsaveSet(setId) { return this.request('DELETE', `/api/social/save/${setId}`); }

  async getSavedSets() { return this.request('GET', '/api/social/saved'); }

  async getProfile(username) { return this.request('GET', `/api/social/profile/${username}`); }

  // ── CLASSROOMS ────────────────────────────────────────────────────────────
  async getClassrooms() { return this.request('GET', '/api/classrooms'); }

  async createClassroom(data) { return this.request('POST', '/api/classrooms', data); }

  async joinClassroom(code) { return this.request('POST', '/api/classrooms/join', { code }); }

  async getStudents(classroomId) { return this.request('GET', `/api/classrooms/${classroomId}/students`); }

  async createAssignment(classroomId, data) {
    return this.request('POST', `/api/classrooms/${classroomId}/assignments`, data);
  }

  async getAssignments(classroomId) {
    return this.request('GET', `/api/classrooms/${classroomId}/assignments`);
  }

  async completeAssignment(assignmentId, score) {
    return this.request('POST', `/api/classrooms/assignments/${assignmentId}/complete`, { score });
  }

  // ── LEO AI ────────────────────────────────────────────────────────────────
  async askLeo(system, messages, maxTokens = 1000) {
    return this.request('POST', '/api/leo', { system, messages, maxTokens });
  }
}

// Global instance
window.lumio = new LumioAPI();

// Auth check disabled until real login is set up
// const PROTECTED_PAGES = ['dashboard.html','profile.html','create.html','study.html','teacher.html','parent.html','settings.html'];
// const currentPage = window.location.pathname.split('/').pop();
// if (PROTECTED_PAGES.includes(currentPage) && !window.lumio.isLoggedIn()) {
//   window.location.href = 'login.html';
// }
