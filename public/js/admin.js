/* admin.js – Admin panel */

let TOKEN = sessionStorage.getItem('adminToken') || '';
let autoRefreshInterval = null;
const AUTO_REFRESH_DELAY = 15000; // 15 seconds

// ---- Helpers ----
function authHeaders() {
  return { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = (type === 'success' ? '✅ ' : '❌ ') + msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ---- Auth ----
async function tryLogin() {
  const pw = document.getElementById('adminPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');

    TOKEN = data.token;
    sessionStorage.setItem('adminToken', TOKEN);
    showPanel();
  } catch (e) {
    errEl.textContent = e.message;
  }
}

function showPanel() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';
  document.getElementById('logoutBtn').style.display = '';
  loadOrders();
  startAutoRefresh();
}

function logout() {
  TOKEN = '';
  sessionStorage.removeItem('adminToken');
  stopAutoRefresh();
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminPanel').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
  document.getElementById('adminPassword').value = '';
}

// ---- Tab navigation ----
document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    link.classList.add('active');
    document.getElementById(`section-${link.dataset.tab}`).classList.add('active');

    if (link.dataset.tab === 'orders') {
      loadOrders();
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
    if (link.dataset.tab === 'flames')   loadFlames();
    if (link.dataset.tab === 'memories') loadAdminMemories();
  });
});

// ---- ORDERS ----
async function loadOrders() {
  const tbody = document.getElementById('ordersBody');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem">Chargement…</td></tr>`;

  try {
    const res = await fetch('/api/admin/orders', { headers: authHeaders() });
    if (res.status === 401) { logout(); return; }
    const orders = await res.json();
    renderOrders(orders);
  } catch {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger)">Erreur de chargement</td></tr>`;
  }
}

function renderOrders(orders) {
  const tbody = document.getElementById('ordersBody');
  const stats = document.getElementById('ordersStats');

  const total     = orders.length;
  const prepared  = orders.filter(o => o.prepared).length;
  const sent      = orders.filter(o => o.sent).length;
  const pending   = orders.filter(o => !o.prepared).length;

  stats.innerHTML = `
    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Total</div></div>
    <div class="stat-card"><div class="stat-value">${pending}</div><div class="stat-label">En attente</div></div>
    <div class="stat-card"><div class="stat-value">${prepared}</div><div class="stat-label">Préparées</div></div>
    <div class="stat-card"><div class="stat-value">${sent}</div><div class="stat-label">Envoyées</div></div>`;

  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem">Aucune commande pour le moment.</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(o => `
    <tr data-id="${o.id}">
      <td><strong>${o.customerName}</strong></td>
      <td>
        <span class="color-dot" style="background:${o.flameColor}"></span>
        ${o.flameName}
      </td>
      <td style="color:var(--text-muted);font-size:0.82rem">${fmtDate(o.createdAt)}</td>
      <td>
        <label class="toggle" title="Marquer comme préparée">
          <input type="checkbox" ${o.prepared ? 'checked' : ''}
                 onchange="updateOrder('${o.id}','prepared',this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td>
        <label class="toggle" title="Marquer comme envoyée">
          <input type="checkbox" ${o.sent ? 'checked' : ''}
                 onchange="updateOrder('${o.id}','sent',this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td>
        <button class="btn btn-danger btn-sm btn-icon"
                onclick="deleteOrder('${o.id}')" title="Supprimer">🗑</button>
      </td>
    </tr>`).join('');
}

async function updateOrder(id, field, value) {
  try {
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ [field]: value })
    });
    if (!res.ok) throw new Error();
    toast(field === 'prepared' ? (value ? 'Marquée préparée' : 'Non préparée') : (value ? 'Envoyée' : 'Non envoyée'));
  } catch {
    toast('Erreur de mise à jour', 'error');
    loadOrders();
  }
}

async function deleteOrder(id) {
  if (!confirm('Supprimer cette commande ?')) return;
  try {
    await fetch(`/api/admin/orders/${id}`, { method: 'DELETE', headers: authHeaders() });
    toast('Commande supprimée');
    loadOrders();
  } catch {
    toast('Erreur de suppression', 'error');
  }
}

document.getElementById('refreshOrders').addEventListener('click', loadOrders);

// ---- Auto-refresh ----
function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshInterval = setInterval(loadOrders, AUTO_REFRESH_DELAY);
  const btn = document.getElementById('toggleAutoRefresh');
  if (btn) {
    btn.classList.add('active');
    btn.title = 'Auto-refresh actif (toutes les 15 s) – cliquez pour désactiver';
  }
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
  const btn = document.getElementById('toggleAutoRefresh');
  if (btn) {
    btn.classList.remove('active');
    btn.title = 'Auto-refresh désactivé – cliquez pour activer';
  }
}

function toggleAutoRefresh() {
  if (autoRefreshInterval) stopAutoRefresh();
  else startAutoRefresh();
}

document.getElementById('toggleAutoRefresh').addEventListener('click', toggleAutoRefresh);

// ---- FLAMES ----
async function loadFlames() {
  const grid = document.getElementById('flamesAdminGrid');
  grid.innerHTML = '<p style="color:var(--text-muted)">Chargement…</p>';
  try {
    const res = await fetch('/api/admin/flames', { headers: authHeaders() });
    const flames = await res.json();
    renderFlamesAdmin(flames);
  } catch {
    grid.innerHTML = '<p style="color:var(--danger)">Erreur</p>';
  }
}

function renderFlamesAdmin(flames) {
  const grid = document.getElementById('flamesAdminGrid');
  if (!flames.length) {
    grid.innerHTML = '<p style="color:var(--text-muted)">Aucune flammekueche.</p>';
    return;
  }
  grid.innerHTML = flames.map(f => {
    const imgHTML = f.image
      ? `<img class="flame-admin-card-img flame-admin-img" src="${f.image}" alt="">`
      : `<div class="flame-admin-card-img" style="display:flex;align-items:center;justify-content:center;font-size:2.5rem;background:var(--bg)">🫓</div>`;
    return `
    <div class="flame-admin-card" id="fcard-${f.id}">
      ${imgHTML}
      <div class="flame-admin-card-body">
        <div class="flame-admin-card-header">
          <div class="flame-color-swatch" style="background:${f.color}"></div>
          <div>
            <div class="flame-admin-name">${f.name}</div>
            <span class="badge ${f.available ? 'badge-success' : 'badge-muted'}">
              ${f.available ? '● Disponible' : '● Indisponible'}
            </span>
          </div>
        </div>
        <div class="flame-admin-desc">${f.description || '—'}</div>
        <div class="flame-admin-actions">
          <button class="btn btn-secondary btn-sm"
                  onclick="toggleFlame('${f.id}', ${!f.available})">
            ${f.available ? 'Désactiver' : 'Activer'}
          </button>
          <button class="btn btn-danger btn-sm btn-icon"
                  onclick="deleteFlame('${f.id}')">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Swap placeholder on image error
  grid.querySelectorAll('.flame-admin-img').forEach(img => {
    img.addEventListener('error', () => {
      const placeholder = document.createElement('div');
      placeholder.className = 'flame-admin-card-img';
      placeholder.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:2.5rem;background:var(--bg)';
      placeholder.textContent = '🫓';
      img.replaceWith(placeholder);
    });
  });
}

document.getElementById('addFlameBtn').addEventListener('click', async () => {
  const name  = document.getElementById('flameName').value.trim();
  const color = document.getElementById('flameColor').value;
  const desc  = document.getElementById('flameDesc').value.trim();
  const image = document.getElementById('flameImage').value.trim();

  if (!name) { toast('Le nom est requis.', 'error'); return; }

  try {
    const res = await fetch('/api/admin/flames', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, color, description: desc, image })
    });
    if (!res.ok) throw new Error();
    document.getElementById('flameName').value = '';
    document.getElementById('flameDesc').value = '';
    document.getElementById('flameImage').value = '';
    toast('Flammekueche ajoutée !');
    loadFlames();
  } catch {
    toast('Erreur lors de l\'ajout', 'error');
  }
});

async function toggleFlame(id, available) {
  try {
    const res = await fetch(`/api/admin/flames/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ available })
    });
    if (!res.ok) throw new Error();
    toast(available ? 'Flamme activée' : 'Flamme désactivée');
    loadFlames();
  } catch {
    toast('Erreur', 'error');
  }
}

async function deleteFlame(id) {
  if (!confirm('Supprimer cette flamme ?')) return;
  try {
    await fetch(`/api/admin/flames/${id}`, { method: 'DELETE', headers: authHeaders() });
    toast('Flamme supprimée');
    loadFlames();
  } catch {
    toast('Erreur', 'error');
  }
}

// ---- MEMORIES ----
async function loadAdminMemories() {
  const grid = document.getElementById('memoriesAdminGrid');
  grid.innerHTML = '<p style="color:var(--text-muted)">Chargement…</p>';
  try {
    const res = await fetch('/api/memories');
    const memories = await res.json();
    renderAdminMemories(memories);
  } catch {
    grid.innerHTML = '<p style="color:var(--danger)">Erreur</p>';
  }
}

function renderAdminMemories(memories) {
  const grid = document.getElementById('memoriesAdminGrid');
  if (!memories.length) {
    grid.innerHTML = '<p style="color:var(--text-muted)">Aucune photo.</p>';
    return;
  }
  grid.innerHTML = memories.map(m => `
    <div class="memory-card" style="cursor:default">
      <img class="memory-img" src="${m.imagePath}" alt="${m.caption || ''}">
      <div class="memory-info">
        <span class="memory-caption">${m.caption || '—'}</span>
        <span class="memory-year">${m.year}</span>
      </div>
      <div style="padding:0 1rem 0.75rem;display:flex;justify-content:flex-end">
        <button class="btn btn-danger btn-sm btn-icon"
                onclick="deleteMemory('${m.id}')">🗑 Supprimer</button>
      </div>
    </div>`).join('');
}

document.getElementById('uploadMemoryBtn').addEventListener('click', async () => {
  const year    = document.getElementById('memoryYear').value;
  const caption = document.getElementById('memoryCaption').value.trim();
  const file    = document.getElementById('memoryFile').files[0];

  if (!year || !file) { toast('L\'année et la photo sont requises.', 'error'); return; }

  const form = new FormData();
  form.append('year', year);
  form.append('caption', caption);
  form.append('image', file);

  try {
    const res = await fetch('/api/admin/memories', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      body: form
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Erreur');
    }
    document.getElementById('memoryYear').value    = '';
    document.getElementById('memoryCaption').value = '';
    document.getElementById('memoryFile').value    = '';
    toast('Photo ajoutée !');
    loadAdminMemories();
  } catch (e) {
    toast(e.message, 'error');
  }
});

async function deleteMemory(id) {
  if (!confirm('Supprimer cette photo ?')) return;
  try {
    await fetch(`/api/admin/memories/${id}`, { method: 'DELETE', headers: authHeaders() });
    toast('Photo supprimée');
    loadAdminMemories();
  } catch {
    toast('Erreur', 'error');
  }
}

// ---- Bootstrap ----
document.getElementById('loginBtn').addEventListener('click', tryLogin);
document.getElementById('adminPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') tryLogin();
});
document.getElementById('logoutBtn').addEventListener('click', logout);

// Auto-login if token exists in session
if (TOKEN) {
  fetch('/api/admin/orders', { headers: authHeaders() }).then(r => {
    if (r.ok) showPanel(); else logout();
  }).catch(logout);
}
