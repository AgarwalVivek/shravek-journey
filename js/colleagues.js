(function () {
  'use strict';

  const baseUrl = 'https://shravekjourneyphotos.blob.core.windows.net/photos/colleagues';
  const photos = Array.from({ length: 8 }, (_, index) => ({
    url: `${baseUrl}/colleague-${String(index + 1).padStart(2, '0')}.webp`,
    alt: `Friends and colleagues memory ${index + 1}`
  }));
  const gallery = document.getElementById('colleagues-gallery');
  const lightbox = document.getElementById('colleagues-lightbox');
  const lightboxImage = lightbox.querySelector('.colleagues-lightbox__image');
  const lightboxCounter = lightbox.querySelector('.colleagues-lightbox__counter');
  let activeIndex = 0;

  function showLightboxImage() {
    const photo = photos[activeIndex];
    lightboxImage.src = photo.url;
    lightboxImage.alt = photo.alt;
    lightboxCounter.textContent = `${activeIndex + 1} / ${photos.length}`;
  }

  function openLightbox(index) {
    activeIndex = index;
    showLightboxImage();
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    lightbox.querySelector('.colleagues-lightbox__close').focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = '';
  }

  function moveLightbox(direction) {
    activeIndex = (activeIndex + direction + photos.length) % photos.length;
    showLightboxImage();
  }

  const fragment = document.createDocumentFragment();
  photos.forEach((photo, index) => {
    const button = document.createElement('button');
    const image = document.createElement('img');
    button.type = 'button';
    button.className = 'colleagues-gallery__item';
    button.setAttribute('aria-label', `Open colleague photograph ${index + 1}`);
    image.src = photo.url;
    image.alt = photo.alt;
    image.loading = index < 2 ? 'eager' : 'lazy';
    image.decoding = 'async';
    button.appendChild(image);
    button.addEventListener('click', () => openLightbox(index));
    fragment.appendChild(button);
  });
  gallery.appendChild(fragment);

  lightbox.querySelector('.colleagues-lightbox__close').addEventListener('click', closeLightbox);
  lightbox.querySelector('.colleagues-lightbox__arrow--previous').addEventListener('click', () => moveLightbox(-1));
  lightbox.querySelector('.colleagues-lightbox__arrow--next').addEventListener('click', () => moveLightbox(1));
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', event => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') moveLightbox(-1);
    if (event.key === 'ArrowRight') moveLightbox(1);
  });
})();
