/**
 * main.js — Shravek Journey Frontend Logic
 * Fetches data from API (Cosmos DB) with fallback to static data.js
 */

// ── Mobile nav ───────────────────────────────────────────
document.getElementById('burger').addEventListener('click', () => {
  document.querySelector('.nav__links').classList.toggle('open');
});

// ── Fetch data from API or fall back to static ───────────
let journeyData = null;

async function loadJourneyData() {
  // Load hero photo settings
  loadHeroPhotos();

  try {
    const res = await fetch('/api/journey/all');
    const result = await res.json();
    if (result.success && result.data) {
      journeyData = result.data;
      console.log('✓ Loaded data from Cosmos DB');
    } else {
      throw new Error('API returned no data');
    }
  } catch (err) {
    console.log('⚡ Using static data (API unavailable):', err.message);
    // Fall back to static JOURNEY_DATA from data.js
    journeyData = {
      timeline: JOURNEY_DATA.timeline,
      travel: JOURNEY_DATA.travel,
      baby: JOURNEY_DATA.baby,
      photos: JOURNEY_DATA.gallery.map(g => ({
        url: g.image || null,
        caption: g.caption,
        emoji: g.emoji
      }))
    };
  }

  renderAll();
}

async function loadHeroPhotos() {
  try {
    const res = await fetch('/api/journey/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      const s = data.settings;
      if (s.heroPhotoLeft) {
        const leftImg = document.querySelector('.hero__photo-left img');
        if (leftImg) { leftImg.src = s.heroPhotoLeft; if (s.heroPhotoLeftAlt) leftImg.alt = s.heroPhotoLeftAlt; }
      }
      if (s.heroPhotoRight) {
        const rightImg = document.querySelector('.hero__photo-right img');
        if (rightImg) { rightImg.src = s.heroPhotoRight; if (s.heroPhotoRightAlt) rightImg.alt = s.heroPhotoRightAlt; }
      }
    }
  } catch (e) {
    // Keep default hardcoded URLs as fallback
    console.log('Using default hero photos');
  }
}

function renderAll() {
  renderTimeline();
  renderTravel();
  renderBaby();
  renderGallery();
}

// ── Render Timeline ──────────────────────────────────────
function renderTimeline() {
  const container = document.getElementById('timeline-container');
  const items = journeyData.timeline || [];

  if (items.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);text-align:center">Timeline coming soon...</p>';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="timeline-item">
      <div class="timeline-item__icon">${item.icon || '✦'}</div>
      <div class="timeline-item__date">${item.date || ''}</div>
      <h3 class="timeline-item__title">${item.title}</h3>
      <p class="timeline-item__desc">${item.description || ''}</p>
      ${item.photoUrl ? `<img src="${item.photoUrl}" alt="${item.title}" class="timeline-item__photo" />` : ''}
      ${item.album ? renderAlbumPhotos(item.album) : ''}
    </div>
  `).join('');
}

// ── Render Travel ────────────────────────────────────────
function renderTravel() {
  const container = document.getElementById('travel-grid');
  const items = journeyData.travel || [];

  if (items.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.5);text-align:center;grid-column:1/-1">Adventures coming soon...</p>';
    return;
  }

  container.innerHTML = items.map(trip => {
    const albumLink = trip.album ? `<a href="album.html?album=${encodeURIComponent(trip.album)}" class="btn btn--dark travel-card__photos">View Photos →</a>` : '';
    return `
    <div class="travel-card">
      <div class="travel-card__img">
        ${trip.photoUrl
          ? `<img src="${trip.photoUrl}" alt="${trip.destination}" style="width:100%;height:100%;object-fit:cover" />`
          : (trip.icon || '✈️')
        }
      </div>
      <div class="travel-card__body">
        <h3 class="travel-card__name">${trip.destination || trip.title || ''}</h3>
        <p class="travel-card__date">${trip.date || ''}</p>
        <p class="travel-card__desc">${trip.description || ''}</p>
        ${albumLink}
      </div>
    </div>`;
  }).join('');
}

// ── Render Baby Journey ──────────────────────────────────
function renderBaby() {
  const container = document.getElementById('baby-grid');
  const items = journeyData.baby || [];

  if (items.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);text-align:center;grid-column:1/-1">Baby journey updates coming soon...</p>';
    return;
  }

  container.innerHTML = items.map(item => {
    const albumLink = item.album ? `<a href="album.html?album=${encodeURIComponent(item.album)}" class="btn btn--dark baby-card__photos">View Photos →</a>` : '';
    return `
    <div class="baby-card">
      <div class="baby-card__icon">${item.icon || '👶'}</div>
      <div class="baby-card__month">${item.month || ''}</div>
      <h3 class="baby-card__title">${item.title || ''}</h3>
      <p class="baby-card__desc">${item.description || ''}</p>
      ${item.photoUrl ? `<img src="${item.photoUrl}" alt="${item.title}" style="width:100%;margin-top:0.75rem;border-radius:4px" />` : ''}
      ${albumLink}
    </div>`;
  }).join('');
}

// ── Helper: detect video URLs ────────────────────────────
function isVideo(item) {
  if (item.type === 'video') return true;
  if (item.url && /\.(mov|mp4|webm|ogg)$/i.test(item.url)) return true;
  return false;
}

function renderMediaTag(item, cssClass, alt) {
  if (!item.url) return item.emoji || '📷';
  if (isVideo(item)) {
    return `<video src="${item.url}" class="${cssClass}" controls playsinline preload="metadata" title="${alt}"></video>`;
  }
  return `<img src="${item.url}" alt="${alt}" class="${cssClass}" loading="lazy" />`;
}

// ── Render Album Photos (link to album page) ────────────
function renderAlbumPhotos(album) {
  const photos = (journeyData.photos || []).filter(p => p.album === album);
  if (photos.length === 0) return '';
  return `
    <a href="album.html?album=${encodeURIComponent(album)}" class="btn btn--dark timeline-album-link">View Photos →</a>`;
}

// ── Render Gallery ───────────────────────────────────────
function renderGallery() {
  const container = document.getElementById('gallery-grid');
  const items = journeyData.photos || [];

  if (items.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);text-align:center;grid-column:1/-1">Photos coming soon...</p>';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="gallery-item" title="${item.caption || ''}">
      ${renderMediaTag(item, '', item.caption || '')}
    </div>
  `).join('');
}

// ── Init ─────────────────────────────────────────────────
loadJourneyData();
