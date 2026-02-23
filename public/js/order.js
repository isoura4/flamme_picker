/* order.js – Kiosk ordering page */

let selectedFlame = null;

// ---- Toast ----
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
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
        <div class="icon">🫓</div><h3>Aucune flammekueche disponible</h3>
        <p>Revenez bientôt.</p></div>`;
      return;
    }

    grid.innerHTML = flames.map(f => {
      const imgHTML = f.image
        ? `<img src="${f.image}" alt="" loading="lazy" class="flame-img">`
        : '';
      return `
        <div class="flame-card" data-id="${f.id}" data-name="${f.name}" data-color="${f.color}"
             data-image="${f.image || ''}">
          <div class="flame-image-wrap">
            ${imgHTML}
            <div class="flame-img-placeholder" style="${f.image ? 'display:none' : ''}">🫓</div>
          </div>
          <div class="flame-card-body">
            <div class="flame-name">${f.name}</div>
            <div class="flame-description">${f.description || ''}</div>
          </div>
        </div>`;
    }).join('');

    // Swap placeholder in on image load error
    grid.querySelectorAll('.flame-img').forEach(img => {
      img.addEventListener('error', () => {
        img.style.display = 'none';
        const placeholder = img.nextElementSibling;
        if (placeholder) placeholder.style.display = '';
      });
    });

    grid.querySelectorAll('.flame-card').forEach(card => {
      card.addEventListener('click', () => selectFlame(card));
    });

  } catch (e) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="icon">⚠️</div><h3>Erreur de chargement</h3>
      <p>Impossible de charger les flammekueches.</p></div>`;
  }
}

// ---- Select a flame ----
function selectFlame(card) {
  document.querySelectorAll('.flame-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedFlame = {
    id:    card.dataset.id,
    name:  card.dataset.name,
    color: card.dataset.color,
    image: card.dataset.image
  };

  const info = document.getElementById('selectedFlameInfo');
  info.innerHTML = '';

  if (selectedFlame.image) {
    const thumb = document.createElement('img');
    thumb.className = 'selected-flame-thumb';
    thumb.src = selectedFlame.image;
    thumb.alt = '';
    thumb.addEventListener('error', () => { thumb.style.display = 'none'; });
    info.appendChild(thumb);
  } else {
    const dot = document.createElement('div');
    dot.className = 'selected-flame-dot';
    dot.style.background = selectedFlame.color;
    info.appendChild(dot);
  }

  const textDiv = document.createElement('div');
  const nameDiv = document.createElement('div');
  nameDiv.className = 'selected-flame-name';
  nameDiv.textContent = selectedFlame.name;
  const subDiv = document.createElement('div');
  subDiv.style.cssText = 'font-size:0.78rem;color:var(--text-muted)';
  subDiv.textContent = 'Flammekueche sélectionnée';
  textDiv.appendChild(nameDiv);
  textDiv.appendChild(subDiv);
  info.appendChild(textDiv);

  const form = document.getElementById('orderForm');
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
