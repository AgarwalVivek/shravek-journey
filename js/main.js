/**
 * main.js — Shravek Journey Frontend Logic
 */

// ── Mobile nav ───────────────────────────────────────────
document.getElementById('burger').addEventListener('click', () => {
  document.querySelector('.nav__links').classList.toggle('open');
});

// ── Render Timeline ──────────────────────────────────────
function renderTimeline() {
  const container = document.getElementById('timeline-container');
  container.innerHTML = JOURNEY_DATA.timeline.map(item => `
    <div class="timeline-item">
      <div class="timeline-item__icon">${item.icon}</div>
      <div class="timeline-item__date">${item.date}</div>
      <h3 class="timeline-item__title">${item.title}</h3>
      <p class="timeline-item__desc">${item.description}</p>
    </div>
  `).join('');
}

// ── Render Travel ────────────────────────────────────────
function renderTravel() {
  const container = document.getElementById('travel-grid');
  container.innerHTML = JOURNEY_DATA.travel.map(trip => `
    <div class="travel-card">
      <div class="travel-card__img">${trip.icon}</div>
      <div class="travel-card__body">
        <h3 class="travel-card__name">${trip.destination}</h3>
        <p class="travel-card__date">${trip.date}</p>
        <p class="travel-card__desc">${trip.description}</p>
      </div>
    </div>
  `).join('');
}

// ── Render Baby Journey ──────────────────────────────────
function renderBaby() {
  const container = document.getElementById('baby-grid');
  container.innerHTML = JOURNEY_DATA.baby.map(item => `
    <div class="baby-card">
      <div class="baby-card__icon">${item.icon}</div>
      <div class="baby-card__month">${item.month}</div>
      <h3 class="baby-card__title">${item.title}</h3>
      <p class="baby-card__desc">${item.description}</p>
    </div>
  `).join('');
}

// ── Render Gallery ───────────────────────────────────────
function renderGallery() {
  const container = document.getElementById('gallery-grid');
  container.innerHTML = JOURNEY_DATA.gallery.map(item => `
    <div class="gallery-item" title="${item.caption}">
      ${item.image
        ? `<img src="${item.image}" alt="${item.caption}" />`
        : item.emoji
      }
    </div>
  `).join('');
}

// ── Init ─────────────────────────────────────────────────
renderTimeline();
renderTravel();
renderBaby();
renderGallery();
