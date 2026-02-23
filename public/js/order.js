/* order.js – Kiosk ordering page */

let selectedFlame = null;

// ---- Flame SVG helper ----
function flameSVG(color) {
  const dark = shiftColor(color, -50);
  return `
    <svg class="flame-svg" style="--flame-color:${color}" viewBox="0 0 100 140"
         xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g${color.replace('#','')}" x1="50" y1="0" x2="50" y2="140"
                        gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stop-color="${color}"/>
          <stop offset="100%" stop-color="${dark}"/>
        </linearGradient>
      </defs>
      <path d="M50 8 C42 30 18 55 18 85 C18 115 32 135 50 135
               C68 135 82 115 82 85 C82 55 58 30 50 8Z"
            fill="url(#g${color.replace('#','')})"/>
      <path d="M50 50 C45 65 36 78 36 92 C36 107 42 120 50 122
               C58 120 64 107 64 92 C64 78 55 65 50 50Z"
            fill="rgba(255,255,255,0.35)"/>
    </svg>`;
}

function shiftColor(hex, amount) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2,'0')).join('');
}

// ---- Toast ----
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = (type === 'success' ? '✅ ' : '❌ ') + msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---- Load flames ----
async function loadFlames() {
  const grid = document.getElementById('flamesGrid');
  try {
    const res = await fetch('/api/flames');
    const flames = await res.json();

    if (!flames.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="icon">🔥</div><h3>Aucune flamme disponible</h3>
        <p>Revenez bientôt.</p></div>`;
      return;
    }

    grid.innerHTML = flames.map(f => `
      <div class="flame-card" data-id="${f.id}" data-name="${f.name}" data-color="${f.color}">
        <div class="flame-icon">${flameSVG(f.color)}</div>
        <div class="flame-name">${f.name}</div>
        <div class="flame-description">${f.description || ''}</div>
      </div>`).join('');

    grid.querySelectorAll('.flame-card').forEach(card => {
      card.addEventListener('click', () => selectFlame(card));
    });

  } catch {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="icon">⚠️</div><h3>Erreur de chargement</h3>
      <p>Impossible de charger les flammes.</p></div>`;
  }
}

// ---- Select a flame ----
function selectFlame(card) {
  document.querySelectorAll('.flame-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedFlame = { id: card.dataset.id, name: card.dataset.name, color: card.dataset.color };

  const info = document.getElementById('selectedFlameInfo');
  info.innerHTML = `
    <div class="selected-flame-dot" style="background:${selectedFlame.color}"></div>
    <div>
      <div class="selected-flame-name">${selectedFlame.name}</div>
      <div style="font-size:0.8rem;color:var(--text-muted)">Flamme sélectionnée</div>
    </div>`;

  const form = document.getElementById('orderForm');
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('customerName').focus();
}

// ---- Cancel ----
document.getElementById('cancelOrder').addEventListener('click', () => {
  selectedFlame = null;
  document.querySelectorAll('.flame-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('orderForm').style.display = 'none';
  document.getElementById('customerName').value = '';
});

// ---- Confirm order ----
document.getElementById('confirmOrder').addEventListener('click', async () => {
  const name = document.getElementById('customerName').value.trim();
  if (!name) { toast('Veuillez entrer votre prénom.', 'error'); return; }
  if (!selectedFlame) { toast('Veuillez sélectionner une flamme.', 'error'); return; }

  const btn = document.getElementById('confirmOrder');
  btn.disabled = true;
  btn.textContent = 'Envoi…';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flameId: selectedFlame.id, customerName: name })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Erreur');

    document.getElementById('successMessage').textContent =
      `Merci ${name} ! Votre ${selectedFlame.name} a bien été commandée.`;
    document.getElementById('successModal').style.display = 'flex';

    // Reset form
    selectedFlame = null;
    document.querySelectorAll('.flame-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('orderForm').style.display = 'none';
    document.getElementById('customerName').value = '';

  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Commander 🔥';
  }
});

// ---- Close success modal ----
document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('successModal').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

loadFlames();
