/* kiosque.js – Photo booth / webcam capture */

let stream = null;
let capturedBlob = null;
let baseImage = null; // Original captured image (before filters/decorations)
let selectedFilter = 'none';
let activeDecorations = new Set();

// ---- Show AI button when Ollama is enabled ----
document.addEventListener('app-config-loaded', function (e) {
  debugLog('Kiosque: config received', e.detail);
  if (e.detail.ollamaEnabled) {
    document.getElementById('aiCaptionBtn').style.display = '';
  }
});

// ---- Toast ----
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---- Camera ----
async function startCamera() {
  debugLog('Kiosque: starting camera…');
  const video = document.getElementById('cameraFeed');
  const errorEl = document.getElementById('cameraError');

  try {
    // Try rear camera first (for smartphones)
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    });
    video.srcObject = stream;
    errorEl.style.display = 'none';
    document.getElementById('captureBtn').disabled = false;
    debugLog('Kiosque: rear camera started');
  } catch (_err) {
    try {
      // Fallback to front / default camera
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false
      });
      video.srcObject = stream;
      errorEl.style.display = 'none';
      document.getElementById('captureBtn').disabled = false;
      debugLog('Kiosque: front camera started');
    } catch (_err2) {
      errorEl.textContent = "Impossible d'accéder à la caméra. Vérifiez les permissions de votre navigateur.";
      errorEl.style.display = 'block';
      document.getElementById('captureBtn').disabled = true;
      debugLog('Kiosque: camera access denied');
    }
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

// ---- Capture (forced 4:3 crop) ----
function capturePhoto() {
  debugLog('Kiosque: capturing photo…');
  const video = document.getElementById('cameraFeed');
  const canvas = document.getElementById('cameraCanvas');

  const vw = video.videoWidth;
  const vh = video.videoHeight;

  // Calculate the largest centered 4:3 crop
  const targetRatio = 4 / 3;
  let cropW, cropH, cropX, cropY;

  if (vw / vh > targetRatio) {
    cropH = vh;
    cropW = Math.round(vh * targetRatio);
    cropX = Math.round((vw - cropW) / 2);
    cropY = 0;
  } else {
    cropW = vw;
    cropH = Math.round(vw / targetRatio);
    cropX = 0;
    cropY = Math.round((vh - cropH) / 2);
  }

  canvas.width = cropW;
  canvas.height = cropH;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  canvas.toBlob(blob => {
    capturedBlob = blob;

    // Store original image for filter/decoration re-rendering
    const img = new Image();
    img.onload = () => {
      baseImage = img;
      selectedFilter = 'none';
      activeDecorations.clear();
      resetFilterAndDecoUI();
      renderPreview();
    };
    img.src = URL.createObjectURL(blob);

    // Switch views
    document.getElementById('cameraView').style.display = 'none';
    document.getElementById('previewView').style.display = 'block';

    stopCamera();
  }, 'image/jpeg', 0.9);
}

// ---- Filters ----
const FILTERS = {
  none:      '',
  sepia:     'sepia(0.8) saturate(1.2)',
  grayscale: 'grayscale(1)',
  warm:      'sepia(0.3) saturate(1.5) brightness(1.05)',
  cool:      'saturate(0.8) brightness(1.05) hue-rotate(20deg)',
  bright:    'brightness(1.2) contrast(1.1) saturate(1.2)',
  vintage:   'sepia(0.5) contrast(0.9) brightness(0.95) saturate(0.7)'
};

function applyFilter(filterName) {
  debugLog('Kiosque: applying filter', filterName);
  selectedFilter = filterName;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filterName);
  });
  renderPreview();
}

// ---- Decorations ----
function toggleDecoration(decoName) {
  debugLog('Kiosque: toggling decoration', decoName);
  if (activeDecorations.has(decoName)) {
    activeDecorations.delete(decoName);
  } else {
    activeDecorations.add(decoName);
  }
  document.querySelectorAll('.deco-btn').forEach(btn => {
    btn.classList.toggle('active', activeDecorations.has(btn.dataset.deco));
  });
  renderPreview();
}

function drawDecorations(ctx, w, h) {
  const decos = Array.from(activeDecorations);
  // Use a seeded-like approach with fixed positions for consistency
  for (const deco of decos) {
    const items = getDecorationItems(deco);
    for (const item of items) {
      ctx.save();
      ctx.translate(item.x * w, item.y * h);
      ctx.rotate(item.rotation);
      ctx.font = `${Math.round(item.size * Math.min(w, h))}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.emoji, 0, 0);
      ctx.restore();
    }
  }
}

function getDecorationItems(deco) {
  // Fixed positions so decorations are consistent across re-renders
  const positions = [
    { x: 0.08, y: 0.10 }, { x: 0.85, y: 0.08 }, { x: 0.15, y: 0.88 },
    { x: 0.90, y: 0.85 }, { x: 0.50, y: 0.06 }, { x: 0.05, y: 0.50 },
    { x: 0.92, y: 0.45 }, { x: 0.35, y: 0.92 }, { x: 0.70, y: 0.90 },
    { x: 0.25, y: 0.12 }, { x: 0.75, y: 0.15 }, { x: 0.60, y: 0.88 }
  ];
  const rotations = [0.1, -0.2, 0.3, -0.1, 0.15, -0.25, 0.2, -0.15, 0.05, -0.3, 0.25, -0.05];
  const sizes = [0.06, 0.05, 0.07, 0.055, 0.065, 0.05, 0.06, 0.055, 0.07, 0.05, 0.06, 0.065];

  const emojiPatterns = {
    confetti: ['🎊', '🎉', '✨'],
    flamme:   ['🫓', '🔥'],
    toque:    ['👨‍🍳', '👩‍🍳', '🧑‍🍳'],
    stars:    ['⭐', '🌟', '💫'],
    hearts:   ['❤️', '🧡', '💛', '💚', '💙', '💜']
  };

  const pattern = emojiPatterns[deco] || ['✨'];
  return positions.map((pos, i) => ({
    ...pos,
    rotation: rotations[i],
    size: sizes[i],
    emoji: pattern[i % pattern.length]
  }));
}

// ---- Render preview (with filters + decorations) ----
function renderPreview() {
  if (!baseImage) return;

  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = baseImage.width;
  canvas.height = baseImage.height;

  // Apply filter
  if (FILTERS[selectedFilter]) {
    ctx.filter = FILTERS[selectedFilter];
  } else {
    ctx.filter = 'none';
  }
  ctx.drawImage(baseImage, 0, 0);
  ctx.filter = 'none';

  // Draw decorations on top
  drawDecorations(ctx, canvas.width, canvas.height);
}

// ---- Build final blob from preview canvas ----
function buildFinalBlob() {
  return new Promise(resolve => {
    const canvas = document.getElementById('previewCanvas');
    canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.9);
  });
}

// ---- Reset UI ----
function resetFilterAndDecoUI() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === 'none');
  });
  document.querySelectorAll('.deco-btn').forEach(btn => {
    btn.classList.remove('active');
  });
}

// ---- Retake ----
function retakePhoto() {
  capturedBlob = null;
  baseImage = null;
  selectedFilter = 'none';
  activeDecorations.clear();
  document.getElementById('previewImg').src = '';
  document.getElementById('photoCaption').value = '';

  document.getElementById('previewView').style.display = 'none';
  document.getElementById('cameraView').style.display = 'block';

  startCamera();
}

// ---- Build optimised blob for AI (smaller & compressed for fast upload) ----
function buildAIBlob() {
  return new Promise(resolve => {
    const canvas = document.getElementById('previewCanvas');
    const maxDim = 512;
    const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
    const aiCanvas = document.createElement('canvas');
    aiCanvas.width = Math.round(canvas.width * scale);
    aiCanvas.height = Math.round(canvas.height * scale);
    const ctx = aiCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, aiCanvas.width, aiCanvas.height);
    aiCanvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.6);
  });
}

// ---- AI description (Ollama vision) ----
async function generateAICaption() {
  debugLog('Kiosque: requesting AI caption…');
  if (!capturedBlob) { toast('Aucune photo capturée.', 'error'); return; }

  const btn = document.getElementById('aiCaptionBtn');
  btn.disabled = true;
  btn.textContent = '🤖 Génération…';

  // Build a smaller optimised image for faster AI processing
  const aiBlob = await buildAIBlob();

  const formData = new FormData();
  formData.append('image', aiBlob, `photo-${Date.now()}.jpg`);

  try {
    const res = await fetch('/api/kiosque/describe', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');

    document.getElementById('photoCaption').value = data.caption;
    debugLog('Kiosque: AI caption received', data.caption);
    toast('Description IA générée !');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖 Description IA';
  }
}

// ---- Validate & upload ----
async function validatePhoto() {
  debugLog('Kiosque: validating and uploading photo…');
  if (!baseImage) { toast('Aucune photo à publier.', 'error'); return; }

  const btn = document.getElementById('validateBtn');
  btn.disabled = true;
  btn.textContent = 'Envoi…';

  const year = new Date().getFullYear();
  const caption = document.getElementById('photoCaption').value.trim();

  // Build the final image with filters + decorations baked in
  const finalBlob = await buildFinalBlob();

  const formData = new FormData();
  formData.append('year', year.toString());
  if (caption) formData.append('caption', caption);
  formData.append('image', finalBlob, `photo-${Date.now()}.jpg`);

  try {
    const res = await fetch('/api/kiosque/photo', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');

    debugLog('Kiosque: photo published successfully', data);
    // Show success
    document.getElementById('previewView').style.display = 'none';
    document.getElementById('successView').style.display = 'block';
    capturedBlob = null;
    baseImage = null;
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ Valider et publier';
  }
}

// ---- New photo ----
function newPhoto() {
  document.getElementById('successView').style.display = 'none';
  document.getElementById('cameraView').style.display = 'block';
  document.getElementById('photoCaption').value = '';
  selectedFilter = 'none';
  activeDecorations.clear();
  startCamera();
}

// ---- Event listeners ----
document.getElementById('captureBtn').addEventListener('click', capturePhoto);
document.getElementById('retakeBtn').addEventListener('click', retakePhoto);
document.getElementById('aiCaptionBtn').addEventListener('click', generateAICaption);
document.getElementById('validateBtn').addEventListener('click', validatePhoto);
document.getElementById('newPhotoBtn').addEventListener('click', newPhoto);

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
});

// Decoration buttons
document.querySelectorAll('.deco-btn').forEach(btn => {
  btn.addEventListener('click', () => toggleDecoration(btn.dataset.deco));
});

// ---- Init ----
startCamera();
