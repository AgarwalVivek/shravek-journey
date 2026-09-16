(function () {
  'use strict';

  const cloak = document.createElement('style');
  cloak.id = 'site-access-cloak';
  cloak.textContent = 'html{visibility:hidden!important}';
  document.head.appendChild(cloak);

  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  fetch('/api/journey/site-auth', {
    credentials: 'same-origin',
    cache: 'no-store'
  }).then(response => {
    if (!response.ok) throw new Error('Authentication required');
    return response.json();
  }).then(result => {
    if (!result.authenticated) throw new Error('Authentication required');
    cloak.remove();
  }).catch(() => {
    window.location.replace(`/access?return=${encodeURIComponent(returnTo)}`);
  });
})();
