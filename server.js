const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD non défini. Utilisez le mot de passe par défaut (déconseillé en production).');
}
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llava';
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
      { id: '1', name: 'Classique',     description: 'Crème fraîche, lardons, oignons',              color: '#E8C97A', image: '/images/classique.jpg',    available: true },
      { id: '2', name: 'Forestière',    description: 'Crème fraîche, champignons, lardons',           color: '#8B7355', image: '/images/forestiere.jpg',   available: true },
      { id: '3', name: 'Alsacienne',    description: 'Crème fraîche, lardons fumés, munster',         color: '#FF7043', image: '/images/alsacienne.jpg',   available: true },
      { id: '4', name: 'Gratinée',      description: 'Crème fraîche, lardons, gruyère fondu',         color: '#FFC107', image: '/images/gratinee.jpg',     available: true },
      { id: '5', name: 'Végétarienne',  description: 'Crème fraîche, poivrons, champignons, oignons', color: '#66BB6A', image: '/images/vegetarienne.jpg', available: true },
      { id: '6', name: 'Sucrée',        description: 'Crème fraîche, pommes, cannelle, sucre',        color: '#F48FB1', image: '/images/sucree.jpg',       available: true }
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

// Rate limiters
const orderLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

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
app.post('/api/orders', orderLimiter, (req, res) => {
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

// Kiosque photo upload (public – webcam / smartphone camera)
app.post('/api/kiosque/photo', uploadLimiter, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image requise' });

  const year = req.body.year || new Date().getFullYear().toString();
  const yearNum = parseInt(year);
  if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Année invalide' });
  }

  // Move file to year-based folder
  const yearDir = path.join(UPLOADS_DIR, yearNum.toString());
  if (!fs.existsSync(yearDir)) fs.mkdirSync(yearDir, { recursive: true });
  const newFilePath = path.join(yearDir, req.file.filename);
  fs.renameSync(req.file.path, newFilePath);

  const db = readDB();
  const memory = {
    id: uuidv4(),
    year: yearNum,
    caption: (req.body.caption || '').trim().substring(0, 200),
    imagePath: `/uploads/${yearNum}/${req.file.filename}`,
    createdAt: new Date().toISOString()
  };
  db.memories.push(memory);
  writeDB(db);
  res.status(201).json(memory);
});

// Kiosque AI description via Ollama vision model
app.post('/api/kiosque/describe', uploadLimiter, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image requise' });

  try {
    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');

    const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: "Décris cette photo en une seule phrase courte, drôle et décalée en français. Sois créatif et humoristique ! Maximum 100 caractères.",
        images: [base64Image],
        stream: false
      })
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      throw new Error(`Ollama error: ${ollamaRes.status} – ${errText}`);
    }

    const ollamaData = await ollamaRes.json();
    const caption = (ollamaData.response || '').trim().substring(0, 100);

    res.json({ caption });
  } catch (e) {
    console.error('Erreur Ollama:', e.message);
    res.status(502).json({ error: "Impossible de contacter l'IA. Vérifiez qu'Ollama est lancé." });
  } finally {
    // Clean up temporary uploaded file
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  }
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
  const { name, description, color, image } = req.body;
  if (!name || !color) return res.status(400).json({ error: 'name et color sont requis' });
  const db = readDB();
  const flame = { id: uuidv4(), name, description: description || '', color, image: image || null, available: true };
  db.flames.push(flame);
  writeDB(db);
  res.status(201).json(flame);
});

app.put('/api/admin/flames/:id', verifyAdmin, (req, res) => {
  const db = readDB();
  const flame = db.flames.find(f => f.id === req.params.id);
  if (!flame) return res.status(404).json({ error: 'Flamme introuvable' });
  const { name, description, color, image, available } = req.body;
  if (name !== undefined) flame.name = name;
  if (description !== undefined) flame.description = description;
  if (color !== undefined) flame.color = color;
  if (image !== undefined) flame.image = image;
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

app.post('/api/admin/memories', verifyAdmin, uploadLimiter, upload.single('image'), (req, res) => {
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

app.delete('/api/admin/memories/:id', verifyAdmin, uploadLimiter, (req, res) => {
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
