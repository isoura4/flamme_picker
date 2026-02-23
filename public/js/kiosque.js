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

// ---- Capture ----
function capturePhoto() {
  const video = document.getElementById('cameraFeed');
  const canvas = document.getElementById('cameraCanvas');

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

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
document.getElementById('validateBtn').addEventListener('click', validatePhoto);
document.getElementById('newPhotoBtn').addEventListener('click', newPhoto);

// ---- Init ----
startCamera();
