(function () {
  'use strict';

  const chapters = [
    {
      id: 'month-1',
      nav: 'Month 1',
      number: '01',
      date: 'November 2025',
      title: 'The First Hello',
      description: 'A tiny secret changed our whole world. Our first scan made the dream feel real, and the quiet adventure of becoming parents began.'
    },
    {
      id: 'month-2',
      nav: 'Month 2',
      number: '02',
      date: 'December 2025',
      title: 'Our Little Secret',
      description: 'The holidays felt warmer with one more heartbeat in the room. We held the news close and imagined all the celebrations still to come.'
    },
    {
      id: 'month-3',
      nav: 'Month 3',
      number: '03',
      date: 'January 2026',
      title: 'New Year, New Adventure',
      description: 'A new year arrived with new traditions, little dates, and a growing sense that every ordinary day together had become extraordinary.'
    },
    {
      id: 'month-4',
      nav: 'Month 4',
      number: '04',
      date: 'February 2026',
      title: 'The Sweetest Reveal',
      description: 'Surrounded by happy faces and so much love, we celebrated one of the biggest surprises of our journey.'
    },
    {
      id: 'month-5',
      nav: 'Month 5',
      number: '05',
      date: 'March 2026',
      title: 'In Full Bloom',
      description: 'As spring painted the trees in blossom, our own little miracle kept growing. It was a season made for pausing and remembering.'
    },
    {
      id: 'month-6',
      nav: 'Month 6',
      number: '06',
      date: 'April 2026',
      title: 'Springtime Together',
      description: 'Tulips, sunshine, and a growing bump made the world feel especially bright. We were more than halfway to meeting our little one.'
    },
    {
      id: 'month-7',
      nav: 'Month 7',
      number: '07',
      date: 'June 7, 2026',
      title: 'Tiny Toes & Pretty Bows',
      description: 'Our seventh month brought everyone together for the sweetest baby shower — a room full of blessings, laughter, and love for the little one on the way.'
    },
    {
      id: 'month-8',
      nav: 'Month 8',
      number: '08',
      date: 'June 2026',
      title: 'Celebrating Dad',
      description: 'A first Father’s Day before the first hello — full of laughter, anticipation, and the promise of all the adventures ahead.'
    },
    {
      id: 'month-9',
      nav: 'Month 9',
      number: '09',
      date: 'July 2026',
      title: 'The Final Countdown',
      description: 'Bags packed, hearts ready, and every day beginning with the same question: could today be the day?'
    },
    {
      id: 'arrival',
      nav: 'Delivery',
      number: 'Hello',
      date: 'August 2026',
      title: 'And Then There Were Three',
      description: 'The wait ended and our greatest chapter began. The first hello, the first cuddle, and the moment our whole world changed.'
    },
    {
      id: 'welcome-home',
      nav: 'Welcome Home',
      number: 'Home',
      date: 'August 2026',
      title: 'Welcome Home, Baby',
      description: 'Home felt completely new with our little one in it. These are the first quiet days, family welcomes, and memories from the beginning of life together.'
    }
  ];

  const media = window.PREGNANCY_MEDIA || {};
  const arrivalMedia = media.arrival || [];
  media.arrival = arrivalMedia.slice(0, 33);
  media['welcome-home'] = arrivalMedia.slice(33);
  const timeline = document.getElementById('pregnancy-timeline');
  const monthNav = document.getElementById('month-nav');
  const lightbox = document.getElementById('media-lightbox');
  const lightboxContent = lightbox.querySelector('.media-lightbox__content');
  const lightboxCounter = lightbox.querySelector('.media-lightbox__counter');
  let activeGallery = [];
  let activeMediaIndex = 0;

  async function preloadJourneyMedia() {
    const preloader = document.getElementById('pregnancy-preloader');
    const progressBar = document.getElementById('pregnancy-load-bar');
    const status = document.getElementById('pregnancy-load-status');
    const urls = [...new Set(Object.values(media).flatMap(items => (
      items.map(item => item.type === 'video' ? item.poster : item.url)
    )).filter(Boolean))];
    let completed = 0;
    let nextIndex = 0;

    function updateProgress() {
      const percentage = urls.length ? Math.round((completed / urls.length) * 100) : 100;
      progressBar.style.width = `${percentage}%`;
      status.textContent = `Loading ${completed} of ${urls.length} memories · ${percentage}%`;
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
          image.onload = null;
          image.onerror = null;
          completed++;
          updateProgress();
          resolve();
        }

        image.onload = finish;
        image.onerror = finish;
        image.decoding = 'async';
        image.src = url;
        if (image.complete) finish();
      });
    }

    async function worker() {
      while (nextIndex < urls.length) {
        const index = nextIndex++;
        await loadImage(urls[index]);
      }
    }

    updateProgress();
    await Promise.all(Array.from({ length: Math.min(8, urls.length) }, worker));
    status.textContent = 'All memories are ready';
    progressBar.style.width = '100%';
    await new Promise(resolve => setTimeout(resolve, 450));

    clearTimeout(window.pregnancyLoadFallback);
    document.documentElement.classList.remove('pregnancy-loading');
    preloader.setAttribute('aria-hidden', 'true');
    setTimeout(() => preloader.remove(), 700);
  }

  monthNav.innerHTML = chapters.map(chapter => (
    `<a class="month-nav__link" href="#${chapter.id}">${chapter.nav}</a>`
  )).join('');

  timeline.innerHTML = chapters.map(chapter => {
    const count = (media[chapter.id] || []).length;
    const arrivalClass = chapter.id === 'arrival' ? ' pregnancy-chapter--arrival' : '';
    return `
      <section class="pregnancy-chapter${arrivalClass}" id="${chapter.id}" data-chapter="${chapter.id}">
        <div class="pregnancy-chapter__heading">
          <span class="pregnancy-chapter__number" aria-hidden="true">${chapter.number}</span>
          <div>
            <p class="pregnancy-chapter__date">${chapter.date}${count ? ` · ${count} memories` : ''}</p>
            <h2>${chapter.title}</h2>
            <p class="pregnancy-chapter__description">${chapter.description}</p>
          </div>
        </div>
        <div class="chapter-gallery" data-gallery="${chapter.id}">
          ${count ? '' : '<p class="chapter-gallery__empty">Some of the sweetest chapters live only in our hearts.</p>'}
        </div>
      </section>`;
  }).join('');

  function createMediaButton(item, chapterId, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chapter-gallery__item';
    button.setAttribute('aria-label', `Open ${item.type === 'video' ? 'video' : 'photo'} ${index + 1}`);
    button.dataset.chapter = chapterId;
    button.dataset.index = String(index);

    const image = document.createElement('img');
    image.src = item.type === 'video' ? item.poster : item.url;
    image.alt = item.alt || `Pregnancy memory ${index + 1}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    button.appendChild(image);

    if (item.type === 'video') {
      const play = document.createElement('span');
      play.className = 'chapter-gallery__play';
      play.setAttribute('aria-hidden', 'true');
      play.textContent = '▶';
      button.appendChild(play);
    }

    button.addEventListener('click', () => openLightbox(chapterId, index));
    return button;
  }

  function renderGallery(chapterId, showAll) {
    const gallery = document.querySelector(`[data-gallery="${chapterId}"]`);
    const items = media[chapterId] || [];
    if (!gallery || !items.length) return;

    const visibleItems = showAll ? items : items.slice(0, 6);
    gallery.replaceChildren();
    visibleItems.forEach((item, index) => gallery.appendChild(createMediaButton(item, chapterId, index)));

    const existingButton = document.querySelector(`[data-more="${chapterId}"]`);
    if (existingButton) existingButton.remove();

    if (!showAll && items.length > visibleItems.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'chapter-gallery__more';
      more.dataset.more = chapterId;
      more.textContent = `View all ${items.length} memories`;
      more.addEventListener('click', () => renderGallery(chapterId, true));
      gallery.after(more);
    }
  }

  const galleryObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      renderGallery(entry.target.dataset.chapter, true);
      galleryObserver.unobserve(entry.target);
    });
  }, { rootMargin: '500px 0px' });

  document.querySelectorAll('[data-chapter]').forEach(section => galleryObserver.observe(section));

  function showLightboxMedia() {
    const item = activeGallery[activeMediaIndex];
    lightboxContent.replaceChildren();

    let element;
    if (item.type === 'video') {
      element = document.createElement('video');
      element.src = item.url;
      element.poster = item.poster || '';
      element.controls = true;
      element.autoplay = true;
      element.playsInline = true;
      element.preload = 'metadata';
    } else {
      element = document.createElement('img');
      element.src = item.url;
      element.alt = item.alt || 'Pregnancy memory';
      element.decoding = 'async';
    }

    lightboxContent.appendChild(element);
    lightboxCounter.textContent = `${activeMediaIndex + 1} / ${activeGallery.length}`;
  }

  function openLightbox(chapterId, index) {
    activeGallery = media[chapterId] || [];
    activeMediaIndex = index;
    lightbox.hidden = false;
    document.body.classList.add('lightbox-open');
    showLightboxMedia();
    lightbox.querySelector('.media-lightbox__close').focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lightboxContent.replaceChildren();
    document.body.classList.remove('lightbox-open');
  }

  function moveLightbox(direction) {
    activeMediaIndex = (activeMediaIndex + direction + activeGallery.length) % activeGallery.length;
    showLightboxMedia();
  }

  lightbox.querySelector('.media-lightbox__close').addEventListener('click', closeLightbox);
  lightbox.querySelector('.media-lightbox__arrow--previous').addEventListener('click', () => moveLightbox(-1));
  lightbox.querySelector('.media-lightbox__arrow--next').addEventListener('click', () => moveLightbox(1));
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', event => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') moveLightbox(-1);
    if (event.key === 'ArrowRight') moveLightbox(1);
  });

  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      document.querySelectorAll('.month-nav__link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
      });
    });
  }, { rootMargin: '-25% 0px -60% 0px' });

  document.querySelectorAll('.pregnancy-chapter').forEach(section => sectionObserver.observe(section));

  const burger = document.getElementById('burger');
  const navLinks = document.querySelector('.pregnancy-nav .nav__links');
  burger.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(isOpen));
    burger.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  });
  navLinks.addEventListener('click', () => {
    navLinks.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
  });

  preloadJourneyMedia();
})();
