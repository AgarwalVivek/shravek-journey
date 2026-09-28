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
  const photos = journeyData.photos || [];

  if (items.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);text-align:center">Timeline coming soon...</p>';
    return;
  }

  const beginnings = photos.filter(photo => photo.album === 'beginnings' && photo.url);
  const curatedTimelinePhotos = {
    'First Met': 'https://shravekjourneyphotos.blob.core.windows.net/photos/beginnings/couple-chicago-train-station.jpg',
    'The Proposal': 'https://shravekjourneyphotos.blob.core.windows.net/photos/beginnings/couple-train.jpg',
    'Married in USA': 'https://shravekjourneyphotos.blob.core.windows.net/photos/photos/usa-wedding/usa-wedding-001.jpg',
    'Our First Car': 'https://shravekjourneyphotos.blob.core.windows.net/photos/beginnings/vivek-chicago.jpg',
    'Married in India': 'https://shravekjourneyphotos.blob.core.windows.net/photos/photos/india-wedding/india-wedding-001.jpg',
    'Baby on the Way!': 'https://shravekjourneyphotos.blob.core.windows.net/photos/pregnancy-journey/month-1/image-001.webp',
    'Gender Reveal!': 'https://shravekjourneyphotos.blob.core.windows.net/photos/IMG_0337.jpg'
  };
  const fallbackPhotos = [
    ...beginnings.map(photo => photo.url),
    'https://shravekjourneyphotos.blob.core.windows.net/photos/pregnancy-journey/month-1/image-001.webp'
  ];
  function timelinePhoto(item, index) {
    const albumCover = photos.find(photo => photo.album === item.album && photo.url);
    return item.photoUrl ||
      (albumCover && albumCover.url) ||
      curatedTimelinePhotos[item.title] ||
      fallbackPhotos[index % fallbackPhotos.length];
  }

  const chapters = items.map((item, index) => {
    const photoUrl = timelinePhoto(item, index);
    const chapterId = `timeline-chapter-${index + 1}`;

    return `
      <article class="timeline-item" id="${chapterId}">
        <div class="timeline-item__media">
          <img src="${photoUrl}" alt="${item.title}" loading="${index < 2 ? 'eager' : 'lazy'}" decoding="async" />
          <span class="timeline-item__number">${String(index + 1).padStart(2, '0')}</span>
        </div>
        <div class="timeline-item__story">
          <p class="timeline-item__chapter">Chapter ${String(index + 1).padStart(2, '0')}</p>
          <p class="timeline-item__date">${item.date || ''}</p>
          <h3 class="timeline-item__title">${item.title}</h3>
          <p class="timeline-item__desc">${item.description || ''}</p>
          ${item.album ? renderAlbumPhotos(item.album) : ''}
        </div>
      </article>
    `;
  }).join('');

  const firstPhoto = timelinePhoto(items[0], 0);
  const firstYear = String(items[0].date || '').match(/\d{4}/);
  container.innerHTML = `
    <div class="timeline-cover" style="--timeline-cover: url('${firstPhoto}')">
      <div class="timeline-cover__content">
        <p>Vivek &amp; Shraddha</p>
        <h3>Every chapter<br /><em>led us here.</em></h3>
        <span>${firstYear ? firstYear[0] : 'Our beginning'} — Today</span>
      </div>
    </div>
    <nav class="timeline-years" aria-label="Jump to a story chapter">
      ${items.map((item, index) => `
        <a href="#timeline-chapter-${index + 1}">
          <span>${String(index + 1).padStart(2, '0')}</span>
          ${item.date || item.title}
        </a>
      `).join('')}
    </nav>
    <div class="timeline-chapters">${chapters}</div>
  `;

}

// ── Render Travel ────────────────────────────────────────
function renderTravel() {
  const container = document.getElementById('travel-grid');
  const items = journeyData.travel || [];

  if (items.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.5);text-align:center;grid-column:1/-1">Adventures coming soon...</p>';
    return;
  }

  container.innerHTML = `
    <div class="travel-map-header">
      <div class="travel-stamp">✈️ ${items.length} Destinations</div>
      <p class="travel-subtitle">Pin by pin, we're mapping our story across the States</p>
    </div>
    <div class="travel-pins">
      ${items.map((trip, i) => {
        const albumLink = trip.album ? `<a href="album.html?album=${encodeURIComponent(trip.album)}" class="travel-pin__photos">View Photos →</a>` : '';
        return `
        <div class="travel-pin" style="animation-delay: ${i * 0.08}s">
          <div class="travel-pin__icon">${trip.icon || '📍'}</div>
          <div class="travel-pin__content">
            <h3 class="travel-pin__name">${trip.destination || trip.title || ''}</h3>
            <span class="travel-pin__state">${trip.date || ''}</span>
            <p class="travel-pin__desc">${trip.description || ''}</p>
            ${albumLink}
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

// ── Render Baby Journey ──────────────────────────────────
function renderBaby() {
  const container = document.getElementById('baby-grid');
  const gateways = [
    {
      href: 'pregnancy.html#month-1',
      image: 'https://shravekjourneyphotos.blob.core.windows.net/photos/pregnancy-journey/month-1/image-001.webp',
      month: 'Months 1–3',
      title: 'First Trimester',
      description: 'The first scan and our little secret.'
    },
    {
      href: 'pregnancy.html#month-4',
      image: 'https://shravekjourneyphotos.blob.core.windows.net/photos/pregnancy-journey/month-4/image-001.webp',
      month: 'Months 4–6',
      title: 'Growing Together',
      description: 'The reveal, spring blooms, and tiny kicks.'
    },
    {
      href: 'pregnancy.html#month-7',
      image: 'https://shravekjourneyphotos.blob.core.windows.net/photos/pregnancy-journey/month-7/image-001.webp',
      month: 'Months 7–9',
      title: 'Almost Here',
      description: 'Our baby shower and the final countdown.'
    },
    {
      href: 'pregnancy.html#arrival',
      image: 'https://shravekjourneyphotos.blob.core.windows.net/photos/pregnancy-journey/arrival/image-001.webp',
      month: 'August 2026',
      title: 'Birth & Welcome Home',
      description: 'The first hello and our first days together.'
    }
  ];

  container.innerHTML = gateways.map(item => `
    <a class="baby-card baby-card--gateway" href="${item.href}">
      <div class="baby-card__image">
        <img src="${item.image}" alt="" loading="lazy" decoding="async" />
      </div>
      <div class="baby-card__body">
        <div class="baby-card__month">${item.month}</div>
        <h3 class="baby-card__title">${item.title}</h3>
        <p class="baby-card__desc">${item.description}</p>
        <span class="baby-card__link">Explore this chapter →</span>
      </div>
    </a>`
  ).join('');
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
  const albumRoutes = {
    beginnings: '/beginnings',
    'wedding-usa': '/wedding-usa',
    'wedding-india': '/wedding-india',
    'gender-reveal': '/gender-reveal'
  };
  const albumUrl = albumRoutes[album] || `album.html?album=${encodeURIComponent(album)}`;
  return `
    <a href="${albumUrl}" class="btn btn--dark timeline-album-link">Explore This Album →</a>`;
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
