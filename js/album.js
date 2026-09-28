(function () {
  'use strict';

  const albumConfigs = {
    'gender-reveal': {
      path: '/gender-reveal',
      eyebrow: 'February 2026 · Our Gender Reveal',
      title: 'It’s a Girl',
      subtitle: 'The sweetest surprise, wrapped in pink',
      description: 'A day filled with anticipation, happy tears, and the moment our future became a little more vivid.',
      storyEyebrow: 'The moment everything turned pink',
      storyTitle: 'The surprise we could hardly wait to share',
      story: 'Surrounded by love, we discovered that the little life growing with us was our baby girl. Every reaction, embrace, and joyful detail lives in these photographs.',
      galleryEyebrow: 'Joy, surprise, and happy tears',
      galleryTitle: 'The Gender Reveal Album',
      footer: 'Made with love for the little girl who had already changed everything.',
      accent: '#c87598',
      accentSoft: '#f6c9dc',
      panel: '#f5dfe8',
      dark: '#20151b'
    },
    'wedding-usa': {
      path: '/wedding-usa',
      eyebrow: 'January 2021 · Our American Wedding',
      title: 'We Said Yes',
      subtitle: 'The beginning of our forever',
      description: 'An intimate promise, a new beginning, and the day we officially became one family in America.',
      storyEyebrow: 'A promise made together',
      storyTitle: 'The quiet beginning of our married life',
      story: 'Simple, intimate, and deeply ours—this was the day we stepped into forever together and began building our life as husband and wife.',
      galleryEyebrow: 'The vows, the smiles, the beginning',
      galleryTitle: 'Our USA Wedding Album',
      footer: 'The first photographs from our forever.',
      accent: '#9a6e4f',
      accentSoft: '#e9ceb7',
      panel: '#eee4d9',
      dark: '#211b17'
    },
    'wedding-india': {
      path: '/wedding-india',
      eyebrow: 'July 2021 · Our Indian Wedding',
      title: 'Home, Love & Tradition',
      subtitle: 'Celebrating our forever with family',
      description: 'Color, tradition, laughter, and the people who had loved us long before we found each other.',
      storyEyebrow: 'Two families, one celebration',
      storyTitle: 'Our love, celebrated at home',
      story: 'We returned to India to celebrate our marriage through the traditions, blessings, and joyful gatherings that made the story feel beautifully complete.',
      galleryEyebrow: 'Tradition, family, and celebration',
      galleryTitle: 'Our India Wedding Album',
      footer: 'A celebration woven from love, family, and tradition.',
      accent: '#a54e42',
      accentSoft: '#efc5ae',
      panel: '#f3dfd3',
      dark: '#241714'
    },
    beginnings: {
      path: '/beginnings',
      eyebrow: '2016 · Where Our Story Began',
      title: 'The Beginning',
      subtitle: 'Two strangers, one Chicago train, everything ahead',
      description: 'Before the weddings, adventures, and growing family, there were ordinary Chicago days that quietly changed our lives.',
      storyEyebrow: 'Before we knew what this would become',
      storyTitle: 'The first pages of our story',
      story: 'A train ride, a station, and two people beginning to know one another. These photographs hold the unpolished, unforgettable days where everything started.',
      galleryEyebrow: 'The earliest memories',
      galleryTitle: 'Where It All Began',
      footer: 'Every great journey begins with one small moment.',
      accent: '#5f7d7f',
      accentSoft: '#b9dcda',
      panel: '#dfe9e6',
      dark: '#152122'
    }
  };

  const pathAlbum = Object.entries(albumConfigs).find(([, config]) => config.path === window.location.pathname);
  const queryAlbum = new URLSearchParams(window.location.search).get('album');
  const albumName = (pathAlbum && pathAlbum[0]) || queryAlbum || '';
  const genericTitle = albumName
    ? albumName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    : 'Our Memories';
  const config = albumConfigs[albumName] || {
    eyebrow: 'A chapter in our story',
    title: genericTitle,
    subtitle: 'The moments that became part of us',
    description: 'A collection of photographs from one unforgettable chapter of our journey.',
    storyEyebrow: 'The story behind the photographs',
    storyTitle: 'A chapter worth remembering',
    story: 'Every photograph holds a small piece of the people, places, and feelings that made this chapter ours.',
    galleryEyebrow: 'Every moment, kept close',
    galleryTitle: `${genericTitle} Album`,
    footer: 'Our journey, one beautiful chapter at a time.',
    accent: '#b96580',
    accentSoft: '#f3bfd0',
    panel: '#f5e9ec',
    dark: '#1c1418'
  };

  const preloader = document.getElementById('album-preloader');
  const progressBar = document.getElementById('album-load-bar');
  const status = document.getElementById('album-load-status');
  const gallery = document.getElementById('album-gallery');
  const emptyState = document.getElementById('album-empty');
  const lightbox = document.getElementById('album-lightbox');
  const lightboxMedia = lightbox.querySelector('.album-lightbox__media');
  const lightboxCaption = lightbox.querySelector('.album-lightbox__caption');
  const lightboxCounter = lightbox.querySelector('.album-lightbox__counter');
  const smoothProgress = window.createSmoothProgress(progressBar);
  let photos = [];
  let activeIndex = 0;

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function applyConfig() {
    document.documentElement.style.setProperty('--album-accent', config.accent);
    document.documentElement.style.setProperty('--album-accent-soft', config.accentSoft);
    document.documentElement.style.setProperty('--album-panel', config.panel);
    document.documentElement.style.setProperty('--album-dark', config.dark);
    setText('album-preloader-eyebrow', config.eyebrow);
    setText('album-preloader-title', `Preparing ${config.title.toLowerCase()}...`);
    setText('album-eyebrow', config.eyebrow);
    setText('album-title', config.title);
    setText('album-subtitle', config.subtitle);
    setText('album-hero-description', config.description);
    setText('album-story-eyebrow', config.storyEyebrow);
    setText('album-story-title', config.storyTitle);
    setText('album-story-description', config.story);
    setText('album-gallery-eyebrow', config.galleryEyebrow);
    setText('album-gallery-title', config.galleryTitle);
    setText('album-footer-text', config.footer);
    document.title = `${config.title} — Shravek Journey`;
    document.getElementById('album-description-meta').content = config.description;
    document.getElementById('album-og-title').content = `${config.title} — Shravek Journey`;
    document.getElementById('album-og-description').content = config.description;
  }

  function isVideo(photo) {
    return photo.type === 'video' || /\.(mov|mp4|webm|ogg)$/i.test(photo.url || '');
  }

  function cleanCaption(photo, index) {
    const caption = String(photo.caption || '').trim();
    const normalizedCaption = caption.toLowerCase().replace(/-/g, ' ');
    const normalizedAlbum = albumName.toLowerCase().replace(/-/g, ' ');
    if (!caption || normalizedCaption === normalizedAlbum || /^photo \d+$/i.test(caption)) {
      return `${config.title} memory ${index + 1}`;
    }
    return caption;
  }

  function showLightboxMedia() {
    const photo = photos[activeIndex];
    const caption = cleanCaption(photo, activeIndex);
    lightboxMedia.replaceChildren();

    if (isVideo(photo)) {
      const video = document.createElement('video');
      video.src = photo.url;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      lightboxMedia.appendChild(video);
    } else {
      const image = document.createElement('img');
      image.src = photo.url;
      image.alt = caption;
      lightboxMedia.appendChild(image);
    }

    lightboxCaption.textContent = caption;
    lightboxCounter.textContent = `${activeIndex + 1} / ${photos.length}`;
  }

  function openLightbox(index) {
    activeIndex = index;
    showLightboxMedia();
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    lightbox.querySelector('.album-lightbox__close').focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = '';
    const video = lightboxMedia.querySelector('video');
    if (video) video.pause();
    lightboxMedia.replaceChildren();
  }

  function moveLightbox(direction) {
    activeIndex = (activeIndex + direction + photos.length) % photos.length;
    showLightboxMedia();
  }

  function renderGallery() {
    if (!photos.length) {
      emptyState.hidden = false;
      return;
    }

    const fragment = document.createDocumentFragment();
    photos.forEach((photo, index) => {
      const button = document.createElement('button');
      const caption = cleanCaption(photo, index);
      button.type = 'button';
      button.className = 'album-gallery__item';
      button.setAttribute('aria-label', `Open ${caption}`);
      button.style.position = 'relative';

      if (isVideo(photo)) {
        const video = document.createElement('video');
        video.src = photo.url;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        button.appendChild(video);
        const badge = document.createElement('span');
        badge.className = 'album-gallery__video-badge';
        badge.textContent = 'Video';
        button.appendChild(badge);
      } else {
        const image = document.createElement('img');
        image.src = photo.url;
        image.alt = caption;
        image.loading = 'lazy';
        image.decoding = 'async';
        button.appendChild(image);
      }

      button.addEventListener('click', () => openLightbox(index));
      fragment.appendChild(button);
    });
    gallery.appendChild(fragment);
  }

  function loadImage(url) {
    return new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const timeout = setTimeout(finish, 30000);

      function finish() {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      }

      image.onload = finish;
      image.onerror = finish;
      image.src = url;
      if (image.complete) finish();
    });
  }

  async function loadAlbum() {
    applyConfig();

    try {
      const response = await fetch(`/api/journey/photos?album=${encodeURIComponent(albumName)}`, {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Unable to load this album.');
      }
      photos = (data.photos || data.items || []).filter(photo => photo.album === albumName);
    } catch (error) {
      status.textContent = 'Unable to load this chapter';
      emptyState.textContent = error.message || 'Unable to load this album.';
      emptyState.hidden = false;
    }

    if (photos.length) {
      const cover = photos.find(photo => !isVideo(photo) && photo.url);
      if (cover) {
        document.getElementById('album-hero').style.setProperty('--album-hero-image', `url("${cover.url}")`);
        const ogImage = document.createElement('meta');
        ogImage.setAttribute('property', 'og:image');
        ogImage.content = cover.url;
        document.head.appendChild(ogImage);
      }
      setText('album-photo-count', `${photos.length} ${photos.length === 1 ? 'memory' : 'memories'} in this chapter`);
      const initialImages = photos.filter(photo => !isVideo(photo)).slice(0, window.matchMedia('(max-width: 900px)').matches ? 2 : 5);
      let completed = 0;
      await Promise.all(initialImages.map(async photo => {
        await loadImage(photo.url);
        completed++;
        smoothProgress.set(Math.round((completed / initialImages.length) * 100));
        status.textContent = completed < initialImages.length ? 'Bringing the first memories into focus' : 'Setting the story in place';
      }));
      renderGallery();
    }

    await smoothProgress.complete();
    status.textContent = 'Your story is ready';
    await new Promise(resolve => setTimeout(resolve, 250));
    document.documentElement.classList.remove('album-memories-loading');
    preloader.setAttribute('aria-hidden', 'true');
    setTimeout(() => preloader.remove(), 700);
  }

  document.getElementById('share-album').addEventListener('click', async () => {
    const shareStatus = document.getElementById('album-share-status');
    const shareData = {
      title: `${config.title} — Shravek Journey`,
      text: config.description,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        shareStatus.textContent = 'Shared successfully';
      } else {
        await navigator.clipboard.writeText(`${shareData.text}\n\n${shareData.url}`);
        shareStatus.textContent = 'Link copied to clipboard';
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        shareStatus.textContent = 'Unable to share this page';
      }
    }
  });

  lightbox.querySelector('.album-lightbox__close').addEventListener('click', closeLightbox);
  lightbox.querySelector('.album-lightbox__arrow--previous').addEventListener('click', () => moveLightbox(-1));
  lightbox.querySelector('.album-lightbox__arrow--next').addEventListener('click', () => moveLightbox(1));
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', event => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') moveLightbox(-1);
    if (event.key === 'ArrowRight') moveLightbox(1);
  });

  loadAlbum();
})();
