/* memories.js – Public memories gallery (garland display) */

let allMemories = [];
let selectedYear = 'all';

const BULB_COLORS = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF922B', '#E84393'];
const PHOTOS_PER_ROW = 5;

// ---- Load data ----
async function loadMemories() {
  debugLog('Memories: loading…');
  try {
    const [memoriesRes, yearsRes] = await Promise.all([
      fetch('/api/memories'),
      fetch('/api/memories/years')
    ]);
    allMemories = await memoriesRes.json();
    const years = await yearsRes.json();
    renderYearTabs(years);
    renderGallery(allMemories);
    debugLog('Memories: loaded', allMemories.length, 'memories,', years.length, 'years');
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
  debugLog('Memories: filtering by year', year);
  selectedYear = year;
  document.querySelectorAll('.year-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.year == year);
  });
  const filtered = year === 'all' ? allMemories : allMemories.filter(m => m.year == year);
  renderGallery(filtered);
}

// ---- Render garland gallery ----
function renderGallery(memories) {
  const grid  = document.getElementById('memoriesGrid');
  const empty = document.getElementById('emptyState');

  if (!memories.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  // Group into rows
  const rows = [];
  for (let i = 0; i < memories.length; i += PHOTOS_PER_ROW) {
    rows.push(memories.slice(i, i + PHOTOS_PER_ROW));
  }

  grid.innerHTML = rows.map(row => `
    <div class="garland-string">
      ${row.map((m, i) => `
        <div class="garland-item"
             data-img="${m.imagePath.replace(/"/g, '&quot;')}"
             data-caption="${(m.caption || '').replace(/"/g, '&quot;')}">
          <div class="garland-bulb" style="--bulb-color: ${BULB_COLORS[i % BULB_COLORS.length]}"></div>
          <div class="garland-wire"></div>
          <div class="garland-clip"></div>
          <div class="garland-photo">
            <img src="${m.imagePath}" alt="${(m.caption || 'Édition ' + m.year).replace(/"/g, '&quot;')}"
                 loading="lazy" onerror="this.style.display='none'">
            <div class="garland-photo-info">
              ${m.caption ? '<div class="garland-photo-caption">' + m.caption + '</div>' : ''}
              <div class="garland-photo-year">${m.year}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');

  grid.querySelectorAll('.garland-item').forEach(item => {
    item.addEventListener('click', () => openLightbox(item.dataset.img, item.dataset.caption));
  });
}

// ---- Lightbox ----
function openLightbox(src, caption) {
  debugLog('Memories: opening lightbox', src);
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
