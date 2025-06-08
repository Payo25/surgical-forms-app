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

// In-memory store for demo (replace with DB later)
let forms = [];
let users = [
  // password: admin123
  { id: '1', username: 'admin@example.com', fullName: 'Admin User', role: 'Admin', password: 'admin123' },
  { id: '2', username: 'jbalboa@example.com', fullName: 'Jose Balboa', role: 'Registered Surgical Assistant', password: 'rsa123' },
  { id: '3', username: 'ba@example.com', fullName: 'Veronica Millan', role: 'Business Assistant', password: 'ba123' },
  { id: '4', username: 'ovirla@example.com', fullName: 'Oscar Virla', role: 'Registered Surgical Assistant', password: 'rsa123' },
  { id: '5', username: 'mferrer@example.com', fullName: 'Miguel Ferrer', role: 'Registered Surgical Assistant', password: 'rsa123' },
  { id: '6', username: 'rruiz@example.com', fullName: 'Rocio Ruiz', role: 'Registered Surgical Assistant', password: 'rsa123' },
  { id: '7', username: 'achourio@example.com', fullName: 'Abraham Chourio', role: 'Registered Surgical Assistant', password: 'rsa123' },
];
let auditLogs = [];

// Hash seeded user passwords if not already hashed
(async () => {
  for (let user of users) {
    // bcrypt hashes start with $2a$ or $2b$
    if (!user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
      user.password = await bcrypt.hash(user.password, 10);
    }
  }
})();

function logAudit(action, actor, details) {
  auditLogs.push({
    timestamp: new Date().toISOString(),
    action,
    actor,
    details
  });
}

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

// --- Forms API using abstraction ---
app.get('/api/forms', async (req, res) => {
  const allForms = useFirestore ? await firestore.getForms() : forms;
  res.json(allForms);
});

app.get('/api/forms/:id', async (req, res) => {
  const form = useFirestore ? await firestore.getFormById(req.params.id) : forms.find(f => f.id === req.params.id);
  if (!form) return res.status(404).json({ error: 'Not found' });
  res.json(form);
});

app.post('/api/forms', upload.single('surgeryFormFile'), async (req, res) => {
  const {
    patientName, dob, insuranceCompany,
    healthCenterName, // healthCenterAddress removed
    // date, time, // removed
    timeIn, timeOut, doctorName, procedure, caseType, status, createdBy
  } = req.body;

  if (
    !patientName || !dob || !insuranceCompany ||
    !healthCenterName ||
    !timeIn || !timeOut || !doctorName || !procedure || !caseType || !req.file
  ) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const newForm = {
    id: String(forms.length + 1),
    patientName,
    dob,
    insuranceCompany,
    healthCenterName,
    date, // use the user-supplied surgery date
    timeIn,
    timeOut,
    doctorName,
    procedure,
    caseType,
    status,
    createdBy,
    surgeryFormFileUrl: `/uploads/${req.file.filename}`,
    createdAt: new Date().toISOString()
  };

  forms.push(newForm);
  logAudit('CREATE_FORM', req.body.createdBy || 'unknown', { formId: newForm.id });
  res.status(201).json(newForm);
});

app.put('/api/forms/:id', async (req, res) => {
  if (useFirestore) {
    const updated = await firestore.updateForm(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    logAudit('UPDATE_FORM', req.body.updatedBy || req.body.createdBy || 'unknown', { formId: req.params.id });
    return res.json(updated);
  }
  const idx = forms.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  forms[idx] = { ...forms[idx], ...req.body, lastModified: new Date().toISOString() };
  logAudit('UPDATE_FORM', req.body.updatedBy || req.body.createdBy || 'unknown', { formId: req.params.id });
  res.json(forms[idx]);
});

app.delete('/api/forms/:id', async (req, res) => {
  if (useFirestore) await firestore.deleteForm(req.params.id); else forms = forms.filter(f => f.id !== req.params.id);
  logAudit('DELETE_FORM', 'unknown', { formId: req.params.id });
  res.status(204).end();
});

// --- Users API using abstraction ---
app.get('/api/users', async (req, res) => {
  const allUsers = useFirestore ? await firestore.getUsers() : users;
  res.json(allUsers.map(u => ({ id: u.id, username: u.username, role: u.role, fullName: u.fullName || '' })));
});

app.post('/api/users', async (req, res) => {
  const { username, role, password, actor, fullName } = req.body;
  if (!username || !role || !password || !fullName) return res.status(400).json({ error: 'Missing fields' });
  if ((useFirestore ? (await firestore.getUsers()).find(u => u.username === username) : users.find(u => u.username === username))) return res.status(409).json({ error: 'User exists' });
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = { id: Date.now().toString(), username, role, password: hashedPassword, fullName };
  if (useFirestore) await firestore.createUser(user); else users.push(user);
  logAudit('CREATE_USER', actor || 'unknown', { userId: user.id, username });
  res.status(201).json({ id: user.id, username: user.username, role: user.role, fullName: user.fullName }); // Don't return password
});

app.put('/api/users/:id', async (req, res) => {
  const { role, actor, fullName, username } = req.body;
  if (useFirestore) {
    const updated = await firestore.updateUser(req.params.id, { role, fullName, username });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    logAudit('UPDATE_USER_ROLE', actor || 'unknown', { userId: req.params.id, newRole: role, fullName, username });
    return res.json(updated);
  }
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (role) users[idx].role = role;
  if (fullName !== undefined) users[idx].fullName = fullName;
  if (username !== undefined) users[idx].username = username;
  logAudit('UPDATE_USER_ROLE', actor || 'unknown', { userId: req.params.id, newRole: role, fullName, username });
  res.json({ id: users[idx].id, username: users[idx].username, role: users[idx].role, fullName: users[idx].fullName });
});

app.delete('/api/users/:id', async (req, res) => {
  if (useFirestore) await firestore.deleteUser(req.params.id); else users = users.filter(u => u.id !== req.params.id);
  logAudit('DELETE_USER', 'unknown', { userId: req.params.id });
  res.status(204).end();
});

// --- Audit Logs API using abstraction ---
app.get('/api/audit-logs', async (req, res) => {
  const allLogs = useFirestore ? await firestore.getAuditLogs() : auditLogs;
  res.json(allLogs);
});

// --- Login API ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  const allUsers = useFirestore ? await firestore.getUsers() : users;
  const user = allUsers.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });
  logAudit('LOGIN', username, { userId: user.id });
  // Send fullName in response and also set it in localStorage on the frontend
  res.json({ id: user.id, username: user.username, role: user.role, fullName: user.fullName || '' });
});

// --- Call Hours Monthly Planner in-memory storage ---
let callAssignments = [];

// Get call assignments for a month/year
app.get('/api/call-hours', (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) return res.status(400).json({ error: 'Missing params' });
  const entry = callAssignments.find(
    ch => ch.month === Number(month) && ch.year === Number(year)
  );
  res.json(entry ? entry.assignments : {});
});

// Set call assignments for a month/year (BA only)
app.post('/api/call-hours', (req, res) => {
  const { month, year, assignments, actorRole } = req.body;
  if (actorRole !== 'Business Assistant') return res.status(403).json({ error: 'Forbidden' });
  if (!month || !year || !assignments) return res.status(400).json({ error: 'Missing params' });
  let entry = callAssignments.find(
    ch => ch.month === Number(month) && ch.year === Number(year)
  );
  if (entry) {
    entry.assignments = assignments;
  } else {
    callAssignments.push({ month: Number(month), year: Number(year), assignments });
  }
  res.json({ success: true });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 
