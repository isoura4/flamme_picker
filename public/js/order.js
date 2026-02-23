/* order.js – Kiosk ordering page */

let selectedFlame = null;

// ---- Flammekueche SVG icon ----
function flammekuecheSVG(color) {
  const light = shiftColor(color, 40);
  const dark  = shiftColor(color, -40);
  return `
    <svg class="flame-svg" style="--flame-color:${color}" viewBox="0 0 160 100"
         xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="crust${color.replace('#','')}" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stop-color="${light}"/>
          <stop offset="100%" stop-color="${shiftColor(color, -60)}"/>
        </radialGradient>
      </defs>
      <!-- Crust / base -->
      <ellipse cx="80" cy="50" rx="76" ry="46" fill="#C8A96E"/>
      <!-- Topping surface -->
      <ellipse cx="80" cy="50" rx="64" ry="36" fill="url(#crust${color.replace('#','')})"/>
      <!-- Topping dots (ingredients) -->
      <circle cx="55" cy="42" r="5" fill="${dark}" opacity="0.85"/>
      <circle cx="72" cy="36" r="4" fill="${dark}" opacity="0.75"/>
      <circle cx="90" cy="40" r="5" fill="${dark}" opacity="0.85"/>
      <circle cx="62" cy="56" r="4" fill="${dark}" opacity="0.75"/>
      <circle cx="80" cy="60" r="5" fill="${dark}" opacity="0.85"/>
      <circle cx="98" cy="54" r="4" fill="${dark}" opacity="0.75"/>
      <circle cx="108" cy="43" r="4" fill="${dark}" opacity="0.7"/>
      <!-- Highlight -->
      <ellipse cx="68" cy="40" rx="18" ry="8" fill="rgba(255,255,255,0.12)" transform="rotate(-15 68 40)"/>
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
        <div class="flame-icon">${flammekuecheSVG(f.color)}</div>
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
      <div style="font-size:0.8rem;color:var(--text-muted)">Flammekueche sélectionnée</div>
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
  if (!selectedFlame) { toast('Veuillez sélectionner une flammekueche.', 'error'); return; }

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
