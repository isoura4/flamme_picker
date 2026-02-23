const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD non défini. Utilisez le mot de passe par défaut (déconseillé en production).');
}
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Ensure directories exist
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ---------- Database helpers ----------

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return initDB();
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    console.error('Erreur lecture DB:', e.message);
    return initDB();
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function initDB() {
  const data = {
    flames: [
      { id: '1', name: 'Flamme Rouge',    description: 'Rouge vif et intense',       color: '#FF3D00', available: true },
      { id: '2', name: 'Flamme Orange',   description: 'Chaude et lumineuse',        color: '#FF6B35', available: true },
      { id: '3', name: 'Flamme Dorée',    description: 'Brillante et élégante',      color: '#FFD700', available: true },
      { id: '4', name: 'Flamme Bleue',    description: 'Mystérieuse et froide',      color: '#4FC3F7', available: true },
      { id: '5', name: 'Flamme Verte',    description: 'Envoûtante et rare',         color: '#69F0AE', available: true },
      { id: '6', name: 'Flamme Violette', description: 'Magique et unique',          color: '#CE93D8', available: true }
    ],
    orders: [],
    memories: []
  };
  writeDB(data);
  return data;
}

// ---------- Middleware ----------

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function verifyAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  next();
}

// ---------- Multer ----------

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images sont autorisées'));
  }
});

// ============================================================
// PUBLIC ROUTES
// ============================================================

// Get available flames
app.get('/api/flames', (_req, res) => {
  const db = readDB();
  res.json(db.flames.filter(f => f.available));
});

// Place an order
app.post('/api/orders', (req, res) => {
  const { flameId, customerName } = req.body;
  if (!flameId || !customerName || !customerName.trim()) {
    return res.status(400).json({ error: 'flameId et customerName sont requis' });
  }
  const db = readDB();
  const flame = db.flames.find(f => f.id === flameId);
  if (!flame || !flame.available) {
    return res.status(404).json({ error: 'Flamme introuvable ou indisponible' });
  }
  const order = {
    id: uuidv4(),
    flameId,
    flameName: flame.name,
    flameColor: flame.color,
    customerName: customerName.trim(),
    createdAt: new Date().toISOString(),
    prepared: false,
    sent: false
  };
  db.orders.push(order);
  writeDB(db);
  res.status(201).json(order);
});

// Get memories (public)
app.get('/api/memories', (req, res) => {
  const db = readDB();
  const year = req.query.year ? parseInt(req.query.year) : null;
  const list = year ? db.memories.filter(m => m.year === year) : db.memories;
  res.json(list.sort((a, b) => b.year - a.year || new Date(b.createdAt) - new Date(a.createdAt)));
});

// Get distinct memory years
app.get('/api/memories/years', (_req, res) => {
  const db = readDB();
  const years = [...new Set(db.memories.map(m => m.year))].sort((a, b) => b - a);
  res.json(years);
});

// ============================================================
// ADMIN ROUTES
// ============================================================

// Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: ADMIN_PASSWORD });
  } else {
    res.status(401).json({ error: 'Mot de passe incorrect' });
  }
});

// --- Orders ---

app.get('/api/admin/orders', verifyAdmin, (_req, res) => {
  const db = readDB();
  res.json(db.orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.patch('/api/admin/orders/:id', verifyAdmin, (req, res) => {
  const db = readDB();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  const { prepared, sent } = req.body;
  if (prepared !== undefined) order.prepared = prepared;
  if (sent !== undefined) order.sent = sent;
  writeDB(db);
  res.json(order);
});

app.delete('/api/admin/orders/:id', verifyAdmin, (req, res) => {
  const db = readDB();
  db.orders = db.orders.filter(o => o.id !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

// --- Flames ---

app.get('/api/admin/flames', verifyAdmin, (_req, res) => {
  res.json(readDB().flames);
});

app.post('/api/admin/flames', verifyAdmin, (req, res) => {
  const { name, description, color } = req.body;
  if (!name || !color) return res.status(400).json({ error: 'name et color sont requis' });
  const db = readDB();
  const flame = { id: uuidv4(), name, description: description || '', color, available: true };
  db.flames.push(flame);
  writeDB(db);
  res.status(201).json(flame);
});

app.put('/api/admin/flames/:id', verifyAdmin, (req, res) => {
  const db = readDB();
  const flame = db.flames.find(f => f.id === req.params.id);
  if (!flame) return res.status(404).json({ error: 'Flamme introuvable' });
  const { name, description, color, available } = req.body;
  if (name !== undefined) flame.name = name;
  if (description !== undefined) flame.description = description;
  if (color !== undefined) flame.color = color;
  if (available !== undefined) flame.available = available;
  writeDB(db);
  res.json(flame);
});

app.delete('/api/admin/flames/:id', verifyAdmin, (req, res) => {
  const db = readDB();
  db.flames = db.flames.filter(f => f.id !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

// --- Memories ---

app.post('/api/admin/memories', verifyAdmin, upload.single('image'), (req, res) => {
  const { year, caption } = req.body;
  if (!req.file || !year) return res.status(400).json({ error: 'image et year sont requis' });
  const db = readDB();
  const memory = {
    id: uuidv4(),
    year: parseInt(year),
    caption: caption || '',
    imagePath: `/uploads/${req.file.filename}`,
    createdAt: new Date().toISOString()
  };
  db.memories.push(memory);
  writeDB(db);
  res.status(201).json(memory);
});

app.delete('/api/admin/memories/:id', verifyAdmin, (req, res) => {
  const db = readDB();
  const memory = db.memories.find(m => m.id === req.params.id);
  if (memory) {
    const filePath = path.join(__dirname, 'public', memory.imagePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.memories = db.memories.filter(m => m.id !== req.params.id);
    writeDB(db);
  }
  res.json({ success: true });
});

// ---------- Start ----------

app.listen(PORT, () => {
  console.log(`🔥 Flamme Picker lancé sur http://localhost:${PORT}`);
  console.log(`🔑 Mot de passe admin défini via ADMIN_PASSWORD (ou valeur par défaut).`);
});
