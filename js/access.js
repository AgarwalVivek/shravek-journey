(function () {
  'use strict';

  const form = document.getElementById('site-access-form');
  const submit = document.getElementById('site-access-submit');
  const error = document.getElementById('site-access-error');
  const searchParams = new URLSearchParams(window.location.search);
  const requestedReturn = searchParams.get('return');
  const inviteToken = searchParams.get('invite');
  const returnTo = requestedReturn && requestedReturn.startsWith('/') && !requestedReturn.startsWith('//')
    ? requestedReturn
    : '/index.html';
  const returnPath = returnTo.split(/[?#]/)[0].toLowerCase();
  const babyShowerAccess = returnPath === '/babyshower.html' ||
    returnPath === '/babyshower' ||
    returnPath === '/babyshower-memories.html' ||
    returnPath === '/babyshower-memories';

  if (babyShowerAccess) {
    document.getElementById('site-access-eyebrow').textContent = 'Private Baby Shower memories';
    document.getElementById('site-access-title').textContent = 'Baby Shower access';
    document.getElementById('site-access-intro').textContent = 'Enter the Baby Shower username and password shared with you.';
    submit.textContent = 'Open Baby Shower Memories';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Checking...';

    try {
      const response = await fetch('/api/journey/site-login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('site-access-username').value.trim(),
          password: document.getElementById('site-access-password').value.trim(),
          page: returnPath
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Invalid login ID or password.');
      }
      window.location.replace(returnTo);
    } catch (requestError) {
      error.textContent = requestError.message || 'Unable to sign in. Please try again.';
      submit.disabled = false;
      submit.textContent = babyShowerAccess ? 'Open Baby Shower Memories' : 'Enter Our Journey';
    }
  });

  async function initializeAccess() {
    if (inviteToken && babyShowerAccess) {
      window.history.replaceState({}, '', `/access?return=${encodeURIComponent(returnTo)}`);
      submit.disabled = true;
      submit.textContent = 'Opening your invitation...';
      try {
        const response = await fetch('/api/journey/site-invite-login', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invite: inviteToken, page: returnPath })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'This invitation link could not be verified.');
        }
        window.location.replace(returnTo);
        return;
      } catch (requestError) {
        error.textContent = `${requestError.message || 'This invitation link could not be verified.'} Enter the shared login details below.`;
        submit.disabled = false;
        submit.textContent = 'Open Baby Shower Memories';
      }
      return;
    }

    fetch(`/api/journey/site-auth?page=${encodeURIComponent(returnPath)}`, {
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(response => {
      if (response.ok) window.location.replace(returnTo);
    }).catch(() => {});
  }

  initializeAccess();
})();
