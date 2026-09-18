(function () {
  'use strict';

  const photos = (window.PREGNANCY_MEDIA && window.PREGNANCY_MEDIA['month-7']) || [];
  const filmPoster = 'https://shravekjourneyphotos.blob.core.windows.net/photos/baby-shower-film/before-we-met-you-poster.webp?v=20260915';
  const preloader = document.getElementById('memories-preloader');
  const progressBar = document.getElementById('memories-load-bar');
  const status = document.getElementById('memories-load-status');
  const preloaderNote = document.getElementById('memories-load-note');
  const gallery = document.getElementById('babyshower-gallery');
  const film = document.getElementById('baby-shower-film-player');
  const filmBuffering = document.getElementById('film-buffering');
  const filmBufferingTitle = document.getElementById('film-buffering-title');
  const filmBufferingNote = document.getElementById('film-buffering-note');
  const filmBufferingBar = document.getElementById('film-buffering-bar');
  const filmBufferingStatus = document.getElementById('film-buffering-status');
  const lightbox = document.getElementById('memories-lightbox');
  const lightboxImage = lightbox.querySelector('.memories-lightbox__image');
  const lightboxCounter = lightbox.querySelector('.memories-lightbox__counter');
  const smoothProgress = window.createSmoothProgress(progressBar);
  let activeIndex = 0;
  let bufferingMessageTimer;
  let bufferingMessageIndex = 0;
  let preloaderMessageIndex = 0;
  const preloaderMessages = [
    'A beautiful story is worth a little wait.',
    'The first smiles are coming into focus.',
    'Laughter, blessings, and happy tears are almost ready.',
    'Stay with us—the film will begin automatically.'
  ];
  const bufferingMessages = [
    ['Opening our story...', 'A little laughter, a few happy tears, and so much love.'],
    ['Bringing the celebration to life...', 'The first moments are almost here.'],
    ['Just a little longer...', 'Some memories are worth waiting a heartbeat for.']
  ];
  const preloaderMessageTimer = setInterval(() => {
    preloaderMessageIndex = (preloaderMessageIndex + 1) % preloaderMessages.length;
    preloaderNote.textContent = preloaderMessages[preloaderMessageIndex];
  }, 2800);

  function showFilmBuffering() {
    if (!filmBuffering || film.paused || film.ended) return;
    filmBuffering.hidden = false;
    updatePlaybackBuffer();
    clearInterval(bufferingMessageTimer);
    bufferingMessageTimer = setInterval(() => {
      bufferingMessageIndex = (bufferingMessageIndex + 1) % bufferingMessages.length;
      [filmBufferingTitle.textContent, filmBufferingNote.textContent] = bufferingMessages[bufferingMessageIndex];
    }, 2600);
  }

  function hideFilmBuffering() {
    if (!filmBuffering) return;
    filmBuffering.hidden = true;
    clearInterval(bufferingMessageTimer);
  }

  function updatePlaybackBuffer() {
    if (!filmBufferingStatus || !filmBufferingBar) return;
    const bufferedSeconds = window.BabyShowerFilm.getBufferedSeconds(film);
    const targetSeconds = 10;
    const percentage = Math.min(100, Math.round((bufferedSeconds / targetSeconds) * 100));
    filmBufferingBar.style.width = `${percentage}%`;
    filmBufferingStatus.textContent = `${Math.floor(bufferedSeconds)} seconds ready · streaming smoothly`;
  }

  film.addEventListener('play', () => {
    if (film.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) showFilmBuffering();
  });
  film.addEventListener('waiting', showFilmBuffering);
  film.addEventListener('stalled', showFilmBuffering);
  film.addEventListener('progress', updatePlaybackBuffer);
  film.addEventListener('playing', hideFilmBuffering);
  film.addEventListener('pause', hideFilmBuffering);
  film.addEventListener('canplay', () => {
    if (!film.paused) hideFilmBuffering();
  });
  film.addEventListener('ended', hideFilmBuffering);

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
    const shareData = {
      title: 'Before We Met You — Baby Shower Memories',
      text: 'Watch our baby shower film and explore every photo from the celebration.',
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        shareStatus.textContent = 'Shared successfully';
      } else {
        await navigator.clipboard.writeText(window.location.href);
        shareStatus.textContent = 'Link copied to clipboard';
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        shareStatus.textContent = 'Copy the page address from your browser to share it';
      }
    }
  });

  async function preloadMemories() {
    const urls = [...new Set([filmPoster, ...photos.slice(0, 5).map(photo => photo.url)].filter(Boolean))];
    let completed = 0;
    let nextIndex = 0;
    let filmProgress = 0;

    function updateProgress() {
      const imageProgress = urls.length ? completed / urls.length : 1;
      const percentage = Math.round((filmProgress * 0.35) + (imageProgress * 65));
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
    const filmPromise = window.BabyShowerFilm.preload(film, (percentage, quality, details) => {
      filmProgress = percentage;
      updateProgress();
      if (details.measuringConnection) {
        status.textContent = 'Finding the smoothest way to begin';
        return;
      }
      const buffered = Math.floor(details.bufferedSeconds);
      const eta = details.etaSeconds;
      status.textContent = eta === null
        ? `A beautiful memory is worth a little wait · ${buffered}s ready`
        : `Worth a little wait · about ${eta}s to go`;
    }).catch(error => {
      console.error('Unable to preload the Baby Shower film.', error);
      filmProgress = 100;
      updateProgress();
    });
    await Promise.all([
      filmPromise,
      ...Array.from({ length: Math.min(4, urls.length) }, worker)
    ]);
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
