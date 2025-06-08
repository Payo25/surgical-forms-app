require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render') ? { rejectUnauthorized: false } : false
});

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend static build
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// --- Storage abstraction ---
const useFirestore = false; // Set to false to use in-memory storage for development

let firestore = null;
let formsCollection, usersCollection, auditLogsCollection;
if (useFirestore) {
  const { Firestore } = require('@google-cloud/firestore');
  const firestoreClient = new Firestore({
    projectId: process.env.GCLOUD_PROJECT || 'your-gcp-project-id',
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'path-to-service-account.json',
  });
  formsCollection = firestoreClient.collection('forms');
  usersCollection = firestoreClient.collection('users');
  auditLogsCollection = firestoreClient.collection('auditLogs');
  firestore = {
    async getForms() {
      const snapshot = await formsCollection.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    async getFormById(id) {
      const doc = await formsCollection.doc(id).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    async createForm(form) {
      const ref = await formsCollection.add(form);
      return { id: ref.id, ...form };
    },
    async updateForm(id, data) {
      await formsCollection.doc(id).update(data);
      const doc = await formsCollection.doc(id).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    async deleteForm(id) {
      await formsCollection.doc(id).delete();
    },
    async getUsers() {
      const snapshot = await usersCollection.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    async createUser(user) {
      const ref = await usersCollection.add(user);
      return { id: ref.id, ...user };
    },
    async updateUser(id, data) {
      await usersCollection.doc(id).update(data);
      const doc = await usersCollection.doc(id).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },
    async deleteUser(id) {
      await usersCollection.doc(id).delete();
    },
    async getAuditLogs() {
      const snapshot = await auditLogsCollection.orderBy('timestamp', 'desc').get();
      return snapshot.docs.map(doc => doc.data());
    },
    async addAuditLog(log) {
      await auditLogsCollection.add(log);
    },
  };
} else {
  firestore = {
    async getForms() { return forms; },
    async getFormById(id) { return forms.find(f => f.id === id); },
    async createForm(form) { forms.push(form); return form; },
    async updateForm(id, data) {
      const idx = forms.findIndex(f => f.id === id);
      if (idx === -1) return null;
      forms[idx] = { ...forms[idx], ...data, lastModified: new Date().toISOString() };
      return forms[idx];
    },
    async deleteForm(id) { forms = forms.filter(f => f.id !== id); },
    async getUsers() { return users; },
    async createUser(user) { users.push(user); return user; },
    async updateUser(id, data) {
      const idx = users.findIndex(u => u.id === id);
      if (idx === -1) return null;
      users[idx] = { ...users[idx], ...data };
      return users[idx];
    },
    async deleteUser(id) { users = users.filter(u => u.id !== id); },
    async getAuditLogs() { return auditLogs; },
    async addAuditLog(log) { auditLogs.push(log); },
  };
}

// --- Forms API using PostgreSQL ---
app.get('/api/forms', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM forms ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/forms/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM forms WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/forms', upload.single('surgeryFormFile'), async (req, res) => {
  const {
    patientName, dob, insuranceCompany,
    healthCenterName, timeIn, timeOut, doctorName, procedure, caseType, status, createdBy, date
  } = req.body;
  if (!patientName || !dob || !insuranceCompany || !healthCenterName || !timeIn || !timeOut || !doctorName || !procedure || !caseType || !req.file) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO forms (patientName, dob, insuranceCompany, healthCenterName, date, timeIn, timeOut, doctorName, procedure, caseType, status, createdBy, surgeryFormFileUrl, createdAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [patientName, dob, insuranceCompany, healthCenterName, date, timeIn, timeOut, doctorName, procedure, caseType, status, createdBy, `/uploads/${req.file.filename}`, new Date().toISOString()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/forms/:id', async (req, res) => {
  try {
    const fields = Object.keys(req.body);
    const values = Object.values(req.body);
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const result = await pool.query(
      `UPDATE forms SET ${setClause}, lastModified = $${fields.length + 1} WHERE id = $${fields.length + 2} RETURNING *`,
      [...values, new Date().toISOString(), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/forms/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM forms WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// --- Users API using PostgreSQL ---
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, role, fullName FROM users ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, role, password, actor, fullName } = req.body;
  if (!username || !role || !password || !fullName) return res.status(400).json({ error: 'Missing fields' });
  try {
    const exists = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (exists.rows.length > 0) return res.status(409).json({ error: 'User exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, role, password, fullName) VALUES ($1, $2, $3, $4) RETURNING id, username, role, fullName',
      [username, role, hashedPassword, fullName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { role, fullName, username } = req.body;
  try {
    const result = await pool.query(
      'UPDATE users SET role = $1, fullName = $2, username = $3 WHERE id = $4 RETURNING id, username, role, fullName',
      [role, fullName, username, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// --- Audit Logs API using PostgreSQL ---
app.get('/api/audit-logs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

function logAudit(action, actor, details) {
  pool.query(
    'INSERT INTO audit_logs (timestamp, action, actor, details) VALUES ($1, $2, $3, $4)',
    [new Date().toISOString(), action, actor, JSON.stringify(details)]
  ).catch(() => {});
}

// --- Login API ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    logAudit('LOGIN', username, { userId: user.id });
    res.json({ id: user.id, username: user.username, role: user.role, fullName: user.fullname || user.fullName });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Call Hours Monthly Planner using PostgreSQL ---
app.get('/api/call-hours', async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) return res.status(400).json({ error: 'Missing params' });
  try {
    const result = await pool.query(
      'SELECT assignments FROM call_hours WHERE month = $1 AND year = $2',
      [Number(month), Number(year)]
    );
    res.json(result.rows[0]?.assignments || {});
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/call-hours', async (req, res) => {
  const { month, year, assignments, actorRole } = req.body;
  if (actorRole !== 'Business Assistant') return res.status(403).json({ error: 'Forbidden' });
  if (!month || !year || !assignments) return res.status(400).json({ error: 'Missing params' });
  try {
    const exists = await pool.query(
      'SELECT 1 FROM call_hours WHERE month = $1 AND year = $2',
      [Number(month), Number(year)]
    );
    if (exists.rows.length > 0) {
      await pool.query(
        'UPDATE call_hours SET assignments = $1 WHERE month = $2 AND year = $3',
        [assignments, Number(month), Number(year)]
      );
    } else {
      await pool.query(
        'INSERT INTO call_hours (month, year, assignments) VALUES ($1, $2, $3)',
        [Number(month), Number(year), assignments]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Catch-all: serve React app for all non-API, non-static routes
app.get('*', (req, res) => {
  // If the request starts with /api or /uploads, skip
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
