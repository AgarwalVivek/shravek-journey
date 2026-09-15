(function () {
  'use strict';

  window.createSmoothProgress = function (progressBar, onChange) {
    let visualProgress = 0;
    let targetProgress = 0;
    let animationFrame = null;
    let lastFrameTime = 0;
    const completionResolvers = [];

    function animate(timestamp) {
      if (!lastFrameTime) lastFrameTime = timestamp;
      const elapsed = timestamp - lastFrameTime;
      lastFrameTime = timestamp;
      visualProgress = Math.min(targetProgress, visualProgress + Math.max(0.15, elapsed / 14));
      progressBar.style.width = `${visualProgress}%`;
      if (onChange) onChange(Math.round(visualProgress));

      if (visualProgress < targetProgress) {
        animationFrame = requestAnimationFrame(animate);
        return;
      }

      animationFrame = null;
      lastFrameTime = 0;
      if (visualProgress >= 100) {
        completionResolvers.splice(0).forEach(resolve => resolve());
      }
    }

    function set(value) {
      targetProgress = Math.max(targetProgress, Math.min(100, value));
      if (!animationFrame && visualProgress < targetProgress) {
        animationFrame = requestAnimationFrame(animate);
      }
    }

    function complete() {
      set(100);
      if (visualProgress >= 100) return Promise.resolve();
      return new Promise(resolve => completionResolvers.push(resolve));
    }

    return { set, complete };
  };
})();
