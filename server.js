const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const sharp = require('sharp');
const fsPromises = fs.promises;

const app = express();

for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2];
  }
}

function parseTrustProxy(value) {
  if (value === undefined) return 'loopback';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

const TRUST_PROXY = parseTrustProxy(process.env.TRUST_PROXY);
app.set('trust proxy', TRUST_PROXY);

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD non défini. Utilisez le mot de passe par défaut (déconseillé en production).');
}
const OLLAMA_ENABLED = !!process.env.OLLAMA_URL;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llava';
const DEBUG = process.env.DEBUG === 'true';
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

let dbWriteQueue = Promise.resolve();

function withDBWriteLock(mutateFn) {
  const operation = dbWriteQueue.then(() => {
    const db = readDB();
    const result = mutateFn(db);
    writeDB(db);
    return result;
  });
  dbWriteQueue = operation.catch(() => {});
  return operation;
}

function parseYearOrNull(value) {
  const yearNum = parseInt(value, 10);
  if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) return null;
  return yearNum;
}

function toPublicFilePath(imagePath) {
  const publicDir = path.resolve(__dirname, 'public');
  const resolvedPath = path.resolve(publicDir, imagePath.replace(/^\/+/, ''));
  if (resolvedPath !== publicDir && !resolvedPath.startsWith(`${publicDir}${path.sep}`)) {
    throw new Error('Chemin public invalide');
  }
  return resolvedPath;
}

function toSafeImageExtension(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '.jpg';
}

function toSafeTempUploadPath(fileName) {
  if (!/^[a-f0-9-]{36}\.[a-z0-9]{1,10}$/i.test(fileName)) {
    throw new Error('Nom de fichier temporaire invalide');
  }
  return path.join(UPLOADS_DIR, fileName);
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

// Get public configuration (exposes non-sensitive flags to the frontend)
app.get('/api/config', (_req, res) => {
  res.json({ ollamaEnabled: OLLAMA_ENABLED, debug: DEBUG });
});

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
app.post('/api/kiosque/photo', uploadLimiter, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image requise' });
  const tempFilePath = toSafeTempUploadPath(req.file.filename);

  const yearNum = parseYearOrNull(req.body.year || new Date().getFullYear().toString());
  if (yearNum === null) {
    await fsPromises.unlink(tempFilePath).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
    return res.status(400).json({ error: 'Année invalide' });
  }

  let imagePath = null;
  try {
    const yearDir = path.join(UPLOADS_DIR, yearNum.toString());
    await fsPromises.mkdir(yearDir, { recursive: true });
    const finalFileName = `${uuidv4()}${toSafeImageExtension(req.file.filename)}`;
    const newFilePath = path.join(yearDir, finalFileName);
    await fsPromises.rename(tempFilePath, newFilePath);
    imagePath = `/uploads/${yearNum}/${finalFileName}`;

    const memory = await withDBWriteLock((db) => {
      const item = {
        id: uuidv4(),
        year: yearNum,
        caption: (req.body.caption || '').trim().substring(0, 200),
        imagePath,
        createdAt: new Date().toISOString()
      };
      db.memories.push(item);
      return item;
    });

    res.status(201).json(memory);
  } catch (e) {
    if (imagePath) {
      await fsPromises.unlink(toPublicFilePath(imagePath)).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      });
    } else {
      await fsPromises.unlink(tempFilePath).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      });
    }
    console.error('Erreur upload kiosque:', e.message);
    res.status(500).json({ error: "Impossible d'enregistrer la photo" });
  }
});

// Kiosque AI description via Ollama vision model
app.post('/api/kiosque/describe', uploadLimiter, upload.single('image'), async (req, res) => {
  if (!OLLAMA_ENABLED) return res.status(501).json({ error: "L'IA n'est pas activée. Définissez la variable d'environnement OLLAMA_URL pour activer." });
  if (!req.file) return res.status(400).json({ error: 'image requise' });
  const tempFilePath = toSafeTempUploadPath(req.file.filename);

  try {
    // Optimise image for faster AI processing: resize to max 512px and compress
    const optimizedBuffer = await sharp(tempFilePath)
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 60 })
      .toBuffer();
    const base64Image = optimizedBuffer.toString('base64');

    const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: "Décris cette photo en une seule phrase très courte, drôle et décalée en français. Sois créatif, humoristique et absurde ! Maximum 50 caractères.",
        images: [base64Image],
        stream: false
      })
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      throw new Error(`Ollama error: ${ollamaRes.status} – ${errText}`);
    }

    const ollamaData = await ollamaRes.json();
    const caption = (ollamaData.response || '').trim().substring(0, 50);

    res.json({ caption });
  } catch (e) {
    console.error('Erreur Ollama:', e.message);
    res.status(502).json({ error: "Impossible de contacter l'IA. Vérifiez qu'Ollama est lancé." });
  } finally {
    // Clean up temporary uploaded file
    await fsPromises.unlink(tempFilePath).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
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

app.post('/api/admin/memories', verifyAdmin, uploadLimiter, upload.single('image'), async (req, res) => {
  const { year, caption } = req.body;
  if (!req.file || !year) return res.status(400).json({ error: 'image et year sont requis' });
  const tempFilePath = toSafeTempUploadPath(req.file.filename);
  const yearNum = parseYearOrNull(year);
  if (yearNum === null) {
    await fsPromises.unlink(tempFilePath).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
    return res.status(400).json({ error: 'Année invalide' });
  }

  let imagePath = null;
  try {
    const yearDir = path.join(UPLOADS_DIR, yearNum.toString());
    await fsPromises.mkdir(yearDir, { recursive: true });
    const finalFileName = `${uuidv4()}${toSafeImageExtension(req.file.filename)}`;
    const newFilePath = path.join(yearDir, finalFileName);
    await fsPromises.rename(tempFilePath, newFilePath);
    imagePath = `/uploads/${yearNum}/${finalFileName}`;

    const memory = await withDBWriteLock((db) => {
      const item = {
        id: uuidv4(),
        year: yearNum,
        caption: (caption || '').trim().substring(0, 200),
        imagePath,
        createdAt: new Date().toISOString()
      };
      db.memories.push(item);
      return item;
    });

    res.status(201).json(memory);
  } catch (e) {
    if (imagePath) {
      await fsPromises.unlink(toPublicFilePath(imagePath)).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      });
    } else {
      await fsPromises.unlink(tempFilePath).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      });
    }
    console.error('Erreur upload admin memories:', e.message);
    res.status(500).json({ error: "Impossible d'enregistrer la photo" });
  }
});

app.delete('/api/admin/memories/:id', verifyAdmin, uploadLimiter, async (req, res) => {
  try {
    const memory = await withDBWriteLock((db) => {
      const found = db.memories.find(m => m.id === req.params.id);
      if (found) db.memories = db.memories.filter(m => m.id !== req.params.id);
      return found || null;
    });

    if (memory) {
      await fsPromises.unlink(toPublicFilePath(memory.imagePath)).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
      });
    }
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur suppression memory:', e.message);
    res.status(500).json({ error: 'Impossible de supprimer la photo' });
  }
});

// ---------- Start ----------

app.listen(PORT, () => {
  console.log(`🔥 Flamme Picker lancé sur http://localhost:${PORT}`);
  console.log(`🔑 Mot de passe admin défini via ADMIN_PASSWORD (ou valeur par défaut).`);
  console.log(`🌐 Trust proxy: ${JSON.stringify(TRUST_PROXY)}`);
  console.log(`🤖 Ollama IA: ${OLLAMA_ENABLED ? `activé (${OLLAMA_URL}, modèle: ${OLLAMA_MODEL})` : 'désactivé (définir OLLAMA_URL pour activer)'}`);
  if (DEBUG) console.log('🐛 Mode DEBUG activé');
});
