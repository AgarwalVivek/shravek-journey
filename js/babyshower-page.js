(function () {
  'use strict';

  const preloader = document.getElementById('babyshower-film-preloader');
  const progressBar = document.getElementById('babyshower-film-load-bar');
  const status = document.getElementById('babyshower-film-load-status');
  const video = document.getElementById('baby-shower-film-player');
  const smoothProgress = window.createSmoothProgress(progressBar, percentage => {
    status.textContent = `Loading our film · ${percentage}%`;
  });

  function revealPage() {
    document.documentElement.classList.remove('babyshower-film-loading');
    preloader.setAttribute('aria-hidden', 'true');
    setTimeout(() => preloader.remove(), 700);
  }

  window.BabyShowerFilm.preload(video, (percentage, quality) => {
    smoothProgress.set(percentage);
    if (quality) status.textContent = `Preparing the ${quality} film · ${percentage}%`;
  }).then(async () => {
    await smoothProgress.complete();
    status.textContent = 'Our film is ready';
    setTimeout(revealPage, 350);
  }).catch(async error => {
    console.error('Unable to preload the Baby Shower film.', error);
    await smoothProgress.complete();
    status.textContent = 'The film is ready to stream';
    setTimeout(revealPage, 700);
  });
})();
