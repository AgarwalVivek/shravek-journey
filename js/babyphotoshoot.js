(function () {
  'use strict';

  const portraits = (window.PREGNANCY_MEDIA && window.PREGNANCY_MEDIA['baby-portraits']) || [];
  const gallery = document.getElementById('portrait-gallery');
  const lightbox = document.getElementById('portrait-lightbox');
  const lightboxImage = lightbox.querySelector('.portrait-lightbox__image');
  const lightboxCounter = lightbox.querySelector('.portrait-lightbox__counter');
  let activeIndex = 0;

  function track(eventName, parameters) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, parameters);
    }
  }

  function showPortrait() {
    const portrait = portraits[activeIndex];
    lightboxImage.src = portrait.url;
    lightboxImage.alt = portrait.alt || `Baby portrait ${activeIndex + 1}`;
    lightboxCounter.textContent = `${activeIndex + 1} / ${portraits.length}`;
  }

  function openLightbox(index) {
    activeIndex = index;
    showPortrait();
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    lightbox.querySelector('.portrait-lightbox__close').focus();
    track('select_content', {
      content_type: 'baby_portrait',
      item_id: portraits[index].sourceName
    });
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = '';
  }

  function moveLightbox(direction) {
    activeIndex = (activeIndex + direction + portraits.length) % portraits.length;
    showPortrait();
  }

  const fragment = document.createDocumentFragment();
  portraits.forEach((portrait, index) => {
    const button = document.createElement('button');
    const image = document.createElement('img');
    button.type = 'button';
    button.className = 'portrait-gallery__item';
    button.setAttribute('aria-label', `Open baby portrait ${index + 1}`);
    image.src = portrait.url;
    image.alt = portrait.alt || `Baby portrait ${index + 1}`;
    image.loading = index < 4 ? 'eager' : 'lazy';
    image.decoding = 'async';
    if (index === 0) image.fetchPriority = 'high';
    button.appendChild(image);
    button.addEventListener('click', () => openLightbox(index));
    fragment.appendChild(button);
  });
  gallery.appendChild(fragment);

  lightbox.querySelector('.portrait-lightbox__close').addEventListener('click', closeLightbox);
  lightbox.querySelector('.portrait-lightbox__arrow--previous').addEventListener('click', () => moveLightbox(-1));
  lightbox.querySelector('.portrait-lightbox__arrow--next').addEventListener('click', () => moveLightbox(1));
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', event => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') moveLightbox(-1);
    if (event.key === 'ArrowRight') moveLightbox(1);
  });

  document.getElementById('share-portraits').addEventListener('click', async () => {
    const status = document.getElementById('portrait-share-status');
    const shareData = {
      title: 'Baby Portrait Studio — Shravek',
      text: 'Explore our complete Baby Portrait Studio collection.',
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        status.textContent = 'Shared successfully';
      } else {
        await navigator.clipboard.writeText(window.location.href);
        status.textContent = 'Link copied to clipboard';
      }
      track('share', { method: navigator.share ? 'web_share' : 'clipboard', content_type: 'baby_portraits' });
    } catch (error) {
      if (error.name !== 'AbortError') {
        status.textContent = 'Copy the page address from your browser to share it';
      }
    }
  });
})();
