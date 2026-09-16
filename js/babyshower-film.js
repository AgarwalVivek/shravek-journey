(function () {
  'use strict';

  function getBufferedSeconds(video) {
    if (!video.buffered.length) return 0;
    for (let index = 0; index < video.buffered.length; index++) {
      if (video.buffered.start(index) <= video.currentTime + 0.1 &&
          video.buffered.end(index) >= video.currentTime) {
        return Math.max(0, video.buffered.end(index) - video.currentTime);
      }
    }
    return 0;
  }

  async function measureBandwidthMbps(url) {
    const separator = url.includes('?') ? '&' : '?';
    const sampleBytes = 1024 * 1024;
    const startedAt = performance.now();

    try {
      const response = await fetch(`${url}${separator}speed-probe=${Date.now()}`, {
        cache: 'no-store',
        headers: { Range: `bytes=1048576-${1048576 + sampleBytes - 1}` }
      });
      if (!response.ok) return null;

      const payload = await response.arrayBuffer();
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.05);
      return (payload.byteLength * 8) / elapsedSeconds / 1000000;
    } catch {
      return null;
    }
  }

  async function chooseQuality(source) {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const hasLargeScreen = window.matchMedia('(min-width: 901px)').matches;
    const saveData = Boolean(connection && connection.saveData);
    const effectiveType = connection && connection.effectiveType;
    const downlink = connection && Number(connection.downlink);
    const constrainedType = /(^|-)2g|3g/.test(effectiveType || '');

    if (!hasLargeScreen || saveData || constrainedType) {
      return { quality: '720p', bandwidthMbps: downlink || null };
    }

    const measuredBandwidth = await measureBandwidthMbps(source.dataset.srcMobile);
    const estimatedBandwidth = measuredBandwidth ||
      (Number.isFinite(downlink) ? downlink : null);
    const quality = estimatedBandwidth === null || estimatedBandwidth >= 16
      ? '1080p'
      : '720p';

    return { quality, bandwidthMbps: estimatedBandwidth };
  }

  async function waitForStartupBuffer(video, quality, onProgress) {
    const targetSeconds = quality === '1080p' ? 12 : 10;
    const startedAt = performance.now();
    let previousBuffered = 0;
    let previousSampleAt = startedAt;
    let mediaSecondsPerSecond = 0;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(), 30000);
      const interval = setInterval(report, 250);

      function cleanup() {
        clearTimeout(timeout);
        clearInterval(interval);
        video.removeEventListener('progress', report);
        video.removeEventListener('canplay', report);
        video.removeEventListener('error', fail);
      }

      function finish() {
        cleanup();
        const bufferedSeconds = getBufferedSeconds(video);
        onProgress(100, quality, {
          bufferedSeconds,
          targetSeconds,
          etaSeconds: 0
        });
        resolve();
      }

      function fail() {
        cleanup();
        reject(new Error('The preloaded film could not be opened.'));
      }

      function report() {
        if (!Number.isFinite(video.duration) || video.duration <= 0) return;

        const now = performance.now();
        const bufferedSeconds = getBufferedSeconds(video);
        const elapsedSeconds = Math.max((now - previousSampleAt) / 1000, 0.001);
        const growth = Math.max(0, bufferedSeconds - previousBuffered);
        if (growth > 0) {
          const currentRate = growth / elapsedSeconds;
          mediaSecondsPerSecond = mediaSecondsPerSecond
            ? (mediaSecondsPerSecond * 0.65) + (currentRate * 0.35)
            : currentRate;
        }
        previousBuffered = bufferedSeconds;
        previousSampleAt = now;

        const remaining = Math.max(0, targetSeconds - bufferedSeconds);
        const etaSeconds = mediaSecondsPerSecond > 0.05
          ? Math.ceil(remaining / mediaSecondsPerSecond)
          : null;
        const percentage = Math.min(99, 10 + Math.round((bufferedSeconds / targetSeconds) * 89));
        onProgress(percentage, quality, {
          bufferedSeconds,
          targetSeconds,
          etaSeconds
        });

        if (bufferedSeconds >= targetSeconds ||
            (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && bufferedSeconds >= 6)) {
          finish();
        }
      }

      video.addEventListener('progress', report);
      video.addEventListener('canplay', report);
      video.addEventListener('error', fail, { once: true });
      report();
    });
  }

  async function preload(video, onProgress) {
    const source = video.querySelector('source');
    onProgress(2, 'HD', {
      bufferedSeconds: 0,
      targetSeconds: 10,
      etaSeconds: null,
      measuringConnection: true
    });
    const selection = await chooseQuality(source);
    const quality = selection.quality;
    const remoteUrl = quality === '1080p' ? source.dataset.srcDesktop : source.dataset.srcMobile;
    if (!remoteUrl) throw new Error('The Baby Shower film URL is missing.');

    try {
      video.dataset.quality = quality;
      onProgress(5, quality, {
        bufferedSeconds: 0,
        targetSeconds: quality === '1080p' ? 12 : 10,
        etaSeconds: null,
        bandwidthMbps: selection.bandwidthMbps
      });
      source.src = remoteUrl;
      video.preload = 'auto';
      video.load();
      await waitForStartupBuffer(video, quality, onProgress);
      return remoteUrl;
    } catch (error) {
      source.src = remoteUrl;
      video.preload = 'auto';
      video.load();
      throw error;
    }
  }

  window.BabyShowerFilm = { chooseQuality, getBufferedSeconds, preload };
})();
