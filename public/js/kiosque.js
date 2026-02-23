/* kiosque.js – Photo booth / webcam capture */

let stream = null;
let capturedBlob = null;

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
    } catch (_err2) {
      errorEl.textContent = "Impossible d'accéder à la caméra. Vérifiez les permissions de votre navigateur.";
      errorEl.style.display = 'block';
      document.getElementById('captureBtn').disabled = true;
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
  const video = document.getElementById('cameraFeed');
  const canvas = document.getElementById('cameraCanvas');

  const vw = video.videoWidth;
  const vh = video.videoHeight;

  // Calculate the largest centered 4:3 crop
  const targetRatio = 4 / 3;
  let cropW, cropH, cropX, cropY;

  if (vw / vh > targetRatio) {
    // Video is wider than 4:3 → crop sides
    cropH = vh;
    cropW = Math.round(vh * targetRatio);
    cropX = Math.round((vw - cropW) / 2);
    cropY = 0;
  } else {
    // Video is taller than 4:3 → crop top/bottom
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
    document.getElementById('previewImg').src = URL.createObjectURL(blob);

    // Switch views
    document.getElementById('cameraView').style.display = 'none';
    document.getElementById('previewView').style.display = 'block';

    stopCamera();
  }, 'image/jpeg', 0.9);
}

// ---- Retake ----
function retakePhoto() {
  capturedBlob = null;
  document.getElementById('previewImg').src = '';
  document.getElementById('photoCaption').value = '';

  document.getElementById('previewView').style.display = 'none';
  document.getElementById('cameraView').style.display = 'block';

  startCamera();
}

// ---- AI description (Ollama vision) ----
async function generateAICaption() {
  if (!capturedBlob) { toast('Aucune photo capturée.', 'error'); return; }

  const btn = document.getElementById('aiCaptionBtn');
  btn.disabled = true;
  btn.textContent = '🤖 Génération…';

  const formData = new FormData();
  formData.append('image', capturedBlob, `photo-${Date.now()}.jpg`);

  try {
    const res = await fetch('/api/kiosque/describe', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');

    document.getElementById('photoCaption').value = data.caption;
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
  if (!capturedBlob) { toast('Aucune photo à publier.', 'error'); return; }

  const btn = document.getElementById('validateBtn');
  btn.disabled = true;
  btn.textContent = 'Envoi…';

  const year = new Date().getFullYear();
  const caption = document.getElementById('photoCaption').value.trim();

  const formData = new FormData();
  formData.append('year', year.toString());
  if (caption) formData.append('caption', caption);
  formData.append('image', capturedBlob, `photo-${Date.now()}.jpg`);

  try {
    const res = await fetch('/api/kiosque/photo', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');

    // Show success
    document.getElementById('previewView').style.display = 'none';
    document.getElementById('successView').style.display = 'block';
    capturedBlob = null;
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
  startCamera();
}

// ---- Event listeners ----
document.getElementById('captureBtn').addEventListener('click', capturePhoto);
document.getElementById('retakeBtn').addEventListener('click', retakePhoto);
document.getElementById('aiCaptionBtn').addEventListener('click', generateAICaption);
document.getElementById('validateBtn').addEventListener('click', validatePhoto);
document.getElementById('newPhotoBtn').addEventListener('click', newPhoto);

// ---- Init ----
startCamera();
