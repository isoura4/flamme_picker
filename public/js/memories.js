/* memories.js – Public memories gallery */

let allMemories = [];
let selectedYear = 'all';

// ---- Load data ----
async function loadMemories() {
  try {
    const [memoriesRes, yearsRes] = await Promise.all([
      fetch('/api/memories'),
      fetch('/api/memories/years')
    ]);
    allMemories = await memoriesRes.json();
    const years = await yearsRes.json();
    renderYearTabs(years);
    renderGallery(allMemories);
  } catch {
    document.getElementById('memoriesGrid').innerHTML = '';
    document.getElementById('emptyState').style.display = 'block';
  }
}

// ---- Year tabs ----
function renderYearTabs(years) {
  const container = document.getElementById('yearTabs');
  const allBtn = container.querySelector('[data-year="all"]');

  // Remove any old year tabs
  container.querySelectorAll('[data-year]:not([data-year="all"])').forEach(el => el.remove());

  years.forEach(year => {
    const btn = document.createElement('button');
    btn.className = 'year-tab';
    btn.dataset.year = year;
    btn.textContent = year;
    btn.addEventListener('click', () => filterYear(year));
    container.appendChild(btn);
  });

  allBtn.addEventListener('click', () => filterYear('all'));
}

function filterYear(year) {
  selectedYear = year;
  document.querySelectorAll('.year-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.year == year);
  });
  const filtered = year === 'all' ? allMemories : allMemories.filter(m => m.year == year);
  renderGallery(filtered);
}

// ---- Render gallery ----
function renderGallery(memories) {
  const grid    = document.getElementById('memoriesGrid');
  const empty   = document.getElementById('emptyState');

  if (!memories.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = memories.map(m => `
    <div class="memory-card" data-img="${m.imagePath}" data-caption="${m.caption || ''}"
         onclick="openLightbox('${m.imagePath}', '${(m.caption || '').replace(/'/g, "\\'")}')">
      <img class="memory-img" src="${m.imagePath}" alt="${m.caption || `Édition ${m.year}`}"
           loading="lazy" onerror="this.parentElement.style.display='none'">
      <div class="memory-info">
        <span class="memory-caption">${m.caption || ''}</span>
        <span class="memory-year">${m.year}</span>
      </div>
    </div>`).join('');
}

// ---- Lightbox ----
function openLightbox(src, caption) {
  document.getElementById('lightboxImg').src = src;
  const cap = document.getElementById('lightboxCaption');
  if (caption) { cap.textContent = caption; cap.style.display = ''; }
  else { cap.style.display = 'none'; }
  document.getElementById('lightbox').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
  document.getElementById('lightboxImg').src = '';
  document.body.style.overflow = '';
}

document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightbox').addEventListener('click', e => {
  if (e.target === document.getElementById('lightbox')) closeLightbox();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
});

loadMemories();
