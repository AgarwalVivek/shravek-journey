(function () {
  'use strict';

  const photos = (window.PREGNANCY_MEDIA && window.PREGNANCY_MEDIA['month-7']) || [];
  const preloader = document.getElementById('memories-preloader');
  const progressBar = document.getElementById('memories-load-bar');
  const status = document.getElementById('memories-load-status');
  const preloaderNote = document.getElementById('memories-load-note');
  const gallery = document.getElementById('babyshower-gallery');
  const youtubePlayer = document.getElementById('babyshower-youtube-player');
  const lightbox = document.getElementById('memories-lightbox');
  const lightboxImage = lightbox.querySelector('.memories-lightbox__image');
  const lightboxCounter = lightbox.querySelector('.memories-lightbox__counter');
  const smoothProgress = window.createSmoothProgress(progressBar);
  let activeIndex = 0;
  let preloaderMessageIndex = 0;

  const requestedStart = Number(new URLSearchParams(window.location.search).get('start'));
  if (youtubePlayer && Number.isInteger(requestedStart) && requestedStart > 0 && requestedStart <= 215) {
    const playerUrl = new URL(youtubePlayer.src);
    playerUrl.searchParams.set('start', String(requestedStart));
    youtubePlayer.src = playerUrl.toString();
  }
  const loadingActions = [
    'Polishing',
    'Bringing into focus',
    'Preparing',
    'Unwrapping',
    'Gathering',
    'Rendering',
    'Setting the scene for',
    'Adding the finishing touch to'
  ];
  const loadingMoments = [
    'the smiles you may recognize',
    'the moments where you might spot yourself',
    'every laugh from the celebration',
    'the blessings shared with our little one',
    'the dance-floor memories',
    'the hugs, happy tears, and candid moments',
    'the celebration from beginning to end',
    'a few surprises waiting later in the film',
    'the people who made the day unforgettable',
    'the final moments worth staying for',
    'the complete high-quality film',
    'every familiar face in the room'
  ];

  function nextEngagementMessage() {
    const action = loadingActions[preloaderMessageIndex % loadingActions.length];
    const moment = loadingMoments[(preloaderMessageIndex * 5) % loadingMoments.length];
    preloaderMessageIndex++;
    return `${action} ${moment}... Please stay until the end—you may see yourself in the film.`;
  }

  const preloaderMessageTimer = setInterval(() => {
    preloaderNote.textContent = nextEngagementMessage();
  }, 2800);

  function renderGallery() {
    const fragment = document.createDocumentFragment();

    photos.forEach((photo, index) => {
      const button = document.createElement('button');
      const image = document.createElement('img');
      button.type = 'button';
      button.className = 'memories-gallery__item';
      button.setAttribute('aria-label', `Open baby shower photograph ${index + 1}`);
      image.src = photo.url;
      image.alt = photo.alt || `Baby shower memory ${index + 1}`;
      image.loading = 'lazy';
      image.decoding = 'async';
      button.appendChild(image);
      button.addEventListener('click', () => openLightbox(index));
      fragment.appendChild(button);
    });

    gallery.appendChild(fragment);
  }

  function showLightboxImage() {
    const photo = photos[activeIndex];
    lightboxImage.src = photo.url;
    lightboxImage.alt = photo.alt || `Baby shower memory ${activeIndex + 1}`;
    lightboxCounter.textContent = `${activeIndex + 1} / ${photos.length}`;
  }

  function openLightbox(index) {
    activeIndex = index;
    showLightboxImage();
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    lightbox.querySelector('.memories-lightbox__close').focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = '';
  }

  function moveLightbox(direction) {
    activeIndex = (activeIndex + direction + photos.length) % photos.length;
    showLightboxImage();
  }

  lightbox.querySelector('.memories-lightbox__close').addEventListener('click', closeLightbox);
  lightbox.querySelector('.memories-lightbox__arrow--previous').addEventListener('click', () => moveLightbox(-1));
  lightbox.querySelector('.memories-lightbox__arrow--next').addEventListener('click', () => moveLightbox(1));
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', event => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') moveLightbox(-1);
    if (event.key === 'ArrowRight') moveLightbox(1);
  });

  document.getElementById('share-memories').addEventListener('click', async () => {
    const shareStatus = document.getElementById('share-status');

    try {
      const response = await fetch('/api/journey/site-share-info', {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const shareData = await response.json();
      if (!response.ok || !shareData.success) {
        throw new Error(shareData.error || 'Unable to prepare sharing details.');
      }

      if (navigator.share) {
        await navigator.share({
          title: shareData.title,
          text: shareData.text,
          url: shareData.url
        });
        shareStatus.textContent = 'Shared successfully';
      } else {
        await navigator.clipboard.writeText(`${shareData.text}\n\n${shareData.url}`);
        shareStatus.textContent = 'Link and login details copied to clipboard';
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        shareStatus.textContent = error.message || 'Unable to share the page';
      }
    }
  });

  async function preloadMemories() {
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    const initialPhotoCount = isMobile ? 2 : 5;
    const urls = [...new Set(photos.slice(0, initialPhotoCount).map(photo => photo.url).filter(Boolean))];
    let completed = 0;
    let nextIndex = 0;

    function updateProgress() {
      const imageProgress = urls.length ? completed / urls.length : 1;
      const percentage = Math.round(imageProgress * 100);
      smoothProgress.set(percentage);
      if (percentage < 25) {
        status.textContent = 'Opening the film reel';
      } else if (percentage < 55) {
        status.textContent = 'Bringing the first smiles into focus';
      } else if (percentage < 85) {
        status.textContent = 'Gathering laughter, blessings, and happy tears';
      } else {
        status.textContent = 'Setting the celebration in motion';
      }
    }

    function loadImage(url) {
      return new Promise(resolve => {
        const image = new Image();
        let settled = false;
        const timeout = setTimeout(finish, 45000);

        function finish() {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          image.onload = null;
          image.onerror = null;
          completed++;
          updateProgress();
          resolve();
        }

        image.onload = async function () {
          if (image.decode) {
            try {
              await image.decode();
            } catch {
              // A loaded image remains displayable if explicit decoding is unavailable.
            }
          }
          finish();
        };
        image.onerror = finish;
        image.decoding = 'async';
        image.src = url;
        if (image.complete) {
          if (image.naturalWidth) {
            image.onload();
          } else {
            finish();
          }
        }
      });
    }

    async function worker() {
      while (nextIndex < urls.length) {
        const index = nextIndex++;
        await loadImage(urls[index]);
      }
    }

    updateProgress();
    await Promise.all(Array.from({ length: Math.min(4, urls.length) }, worker));
    await smoothProgress.complete();
    renderGallery();
    clearInterval(preloaderMessageTimer);
    status.textContent = 'Your story is ready';
    await new Promise(resolve => setTimeout(resolve, 250));
    document.documentElement.classList.remove('babyshower-memories-loading');
    preloader.setAttribute('aria-hidden', 'true');
    setTimeout(() => preloader.remove(), 700);
  }

  preloadMemories();
})();
