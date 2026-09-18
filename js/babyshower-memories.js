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
  const filmQuality = document.getElementById('film-quality');
  const filmQualityStatus = document.getElementById('film-quality-status');
  const lightbox = document.getElementById('memories-lightbox');
  const lightboxImage = lightbox.querySelector('.memories-lightbox__image');
  const lightboxCounter = lightbox.querySelector('.memories-lightbox__counter');
  const smoothProgress = window.createSmoothProgress(progressBar);
  let activeIndex = 0;
  let bufferingMessageTimer;
  let bufferingMessageIndex = 0;
  let preloaderMessageIndex = 0;
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

  const bufferingMessages = [
    ['Opening our story...', 'Stay with us—you may spot yourself in the next scene.'],
    ['Bringing the celebration to life...', 'Every familiar face is worth waiting for.'],
    ['Rendering the next moments...', 'The high-quality film will continue as soon as enough is ready.'],
    ['Gathering smiles and laughter...', 'Your moment may be coming up—please watch until the end.'],
    ['Preparing more memories...', 'The film includes candid moments from across the celebration.'],
    ['Almost back to the celebration...', 'Please hold on while the next high-quality scene loads.'],
    ['Finding the next familiar faces...', 'Someone you know—or you—may appear next.'],
    ['Keeping the film crisp and clear...', 'A little wait helps the video play more smoothly.']
  ];
  const preloaderMessageTimer = setInterval(() => {
    preloaderNote.textContent = nextEngagementMessage();
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

  function qualityUrl(quality) {
    const source = film.querySelector('source');
    return quality === '1080p' ? source.dataset.srcDesktop : source.dataset.srcMobile;
  }

  function updateQualityStatus(selectedQuality, activeQuality) {
    filmQualityStatus.textContent = selectedQuality === 'auto'
      ? `Auto selected ${activeQuality}`
      : `${activeQuality} selected`;
  }

  function waitForMediaEvent(eventNames, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error('The selected video quality took too long to load.')), timeoutMs);

      function cleanup() {
        clearTimeout(timeout);
        eventNames.forEach(eventName => film.removeEventListener(eventName, handleSuccess));
        film.removeEventListener('error', handleError);
      }

      function finish(error) {
        cleanup();
        if (error) reject(error);
        else resolve();
      }

      function handleSuccess() {
        finish();
      }

      function handleError() {
        finish(new Error('The selected video quality could not be loaded.'));
      }

      eventNames.forEach(eventName => film.addEventListener(eventName, handleSuccess, { once: true }));
      film.addEventListener('error', handleError, { once: true });
    });
  }

  async function changeFilmQuality(selectedQuality) {
    const source = film.querySelector('source');
    filmQuality.disabled = true;
    filmQualityStatus.textContent = 'Switching quality...';

    try {
      const selection = selectedQuality === 'auto'
        ? await window.BabyShowerFilm.chooseQuality(source)
        : { quality: selectedQuality };
      const activeQuality = selection.quality;

      if (film.dataset.quality === activeQuality) {
        updateQualityStatus(selectedQuality, activeQuality);
        return;
      }

      const currentTime = film.currentTime;
      const shouldResume = !film.paused && !film.ended;
      const volume = film.volume;
      const muted = film.muted;
      const playbackRate = film.playbackRate;

      filmBuffering.hidden = false;
      filmBufferingTitle.textContent = `Switching to ${activeQuality}...`;
      filmBufferingNote.textContent = 'Keeping your place in the film.';
      source.src = qualityUrl(activeQuality);
      film.dataset.quality = activeQuality;
      film.load();
      await waitForMediaEvent(['loadedmetadata']);

      if (currentTime > 0 && Number.isFinite(film.duration)) {
        const seekReady = waitForMediaEvent(['seeked', 'canplay']);
        film.currentTime = Math.min(currentTime, Math.max(0, film.duration - 0.1));
        await seekReady;
      } else if (film.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        await waitForMediaEvent(['canplay']);
      }

      film.volume = volume;
      film.muted = muted;
      film.playbackRate = playbackRate;
      hideFilmBuffering();
      updateQualityStatus(selectedQuality, activeQuality);

      if (shouldResume) {
        try {
          await film.play();
        } catch {
          filmQualityStatus.textContent += ' · press play to resume';
        }
      }
    } catch (error) {
      hideFilmBuffering();
      filmQualityStatus.textContent = error.message || 'Unable to switch video quality.';
    } finally {
      filmQuality.disabled = false;
    }
  }

  function updatePlaybackBuffer() {
    if (!filmBufferingStatus || !filmBufferingBar) return;
    const bufferedSeconds = window.BabyShowerFilm.getBufferedSeconds(film);
    const targetSeconds = Number(film.dataset.startupBufferSeconds) || 10;
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
  filmQuality.addEventListener('change', () => changeFilmQuality(filmQuality.value));

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
    const urls = [...new Set([filmPoster, ...photos.slice(0, initialPhotoCount).map(photo => photo.url)].filter(Boolean))];
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
      updateQualityStatus(filmQuality.value, quality);
      updateProgress();
      if (details.measuringConnection) {
        status.textContent = 'Preparing the best high-quality experience for your connection';
        return;
      }
      const buffered = Math.floor(details.bufferedSeconds);
      const eta = details.etaSeconds;
      status.textContent = eta === null
        ? `High-quality film · ${buffered}s ready · please stay until the end to spot familiar faces`
        : `Worth a little wait · about ${eta} second${eta === 1 ? '' : 's'} to go`;
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
