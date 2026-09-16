(function () {
  'use strict';

  async function waitForVideo(video) {
    if (video.readyState < 1) {
      await new Promise((resolve, reject) => {
        function cleanup() {
          video.removeEventListener('loadedmetadata', handleLoaded);
          video.removeEventListener('error', handleError);
        }

        function handleLoaded() {
          cleanup();
          resolve();
        }

        function handleError() {
          cleanup();
          reject(new Error('The preloaded film could not be opened.'));
        }

        video.addEventListener('loadedmetadata', handleLoaded, { once: true });
        video.addEventListener('error', handleError, { once: true });
      });
    }

    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;

    await new Promise(resolve => {
      const timeout = setTimeout(finish, 7000);

      function finish() {
        clearTimeout(timeout);
        video.removeEventListener('canplay', finish);
        resolve();
      }

      video.addEventListener('canplay', finish, { once: true });
    });
  }

  async function preload(video, onProgress) {
    const source = video.querySelector('source');
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const prefersMobile = window.matchMedia('(max-width: 900px)').matches;
    const hasConstrainedConnection = connection && (
      connection.saveData || /(^|-)2g|3g/.test(connection.effectiveType || '')
    );
    const useMobileVideo = prefersMobile || hasConstrainedConnection;
    const remoteUrl = useMobileVideo
      ? source.dataset.srcMobile
      : source.dataset.srcDesktop;
    if (!remoteUrl) throw new Error('The Baby Shower film URL is missing.');

    try {
      video.dataset.quality = useMobileVideo ? '480p' : '1080p';
      onProgress(20, video.dataset.quality);
      source.src = remoteUrl;
      video.preload = 'auto';
      video.load();
      await waitForVideo(video);
      onProgress(100, video.dataset.quality);
      return remoteUrl;
    } catch (error) {
      source.src = remoteUrl;
      video.preload = 'auto';
      video.load();
      throw error;
    }
  }

  window.BabyShowerFilm = { preload };
})();
