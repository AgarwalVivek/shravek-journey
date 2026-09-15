(function () {
  'use strict';

  async function waitForVideo(video) {
    if (video.readyState >= 2) return;

    await new Promise((resolve, reject) => {
      function cleanup() {
        video.removeEventListener('loadeddata', handleLoaded);
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

      video.addEventListener('loadeddata', handleLoaded, { once: true });
      video.addEventListener('error', handleError, { once: true });
    });
  }

  async function preload(video, onProgress) {
    const source = video.querySelector('source');
    const remoteUrl = source.dataset.src || source.src;
    if (!remoteUrl) throw new Error('The Baby Shower film URL is missing.');

    try {
      const response = await fetch(remoteUrl, { cache: 'force-cache' });
      if (!response.ok) {
        throw new Error(`Film download failed with status ${response.status}.`);
      }

      const totalBytes = Number(response.headers.get('content-length')) || 0;
      let filmBlob;

      if (response.body && totalBytes) {
        const reader = response.body.getReader();
        const chunks = [];
        let loadedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loadedBytes += value.byteLength;
          onProgress(Math.min(100, Math.round((loadedBytes / totalBytes) * 100)));
        }

        filmBlob = new Blob(chunks, { type: 'video/mp4' });
      } else {
        filmBlob = await response.blob();
      }

      onProgress(100);
      const objectUrl = URL.createObjectURL(filmBlob);
      source.src = objectUrl;
      video.load();
      await waitForVideo(video);
      window.addEventListener('beforeunload', () => URL.revokeObjectURL(objectUrl), { once: true });
      return objectUrl;
    } catch (error) {
      source.src = remoteUrl;
      video.preload = 'auto';
      video.load();
      throw error;
    }
  }

  window.BabyShowerFilm = { preload };
})();
