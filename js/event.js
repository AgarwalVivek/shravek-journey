// Event page logic (RSVP + Registry)
(function () {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('id') || '';

  // Tab switching
  document.querySelectorAll('.event-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.event-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.event-section').forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('section-' + tab.dataset.tab).classList.add('active');
    });
  });

  // Load event info
  loadEvent();
  loadRegistry();

  async function loadEvent() {
    try {
      const res = await fetch('/api/journey/events');
      const data = await res.json();
      if (data.success && data.events && data.events.length > 0) {
        const event = eventId ? data.events.find(e => e.id === eventId) : data.events[0];
        const evt = event || data.events[0];
        if (evt) {
          window._eventId = evt.id;
          document.getElementById('event-title').textContent = evt.name || evt.title || 'Baby Shower';
          document.getElementById('event-date').textContent = evt.date ? new Date(evt.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
          document.getElementById('event-description').textContent = evt.description || '';
          document.title = (evt.name || evt.title || 'Event') + ' — Shravek Journey';
        }
      }
    } catch (e) {
      console.log('Could not load event info');
    }
  }

  // ─── Registry ───────────────────────────────────────────
  async function loadRegistry() {
    const grid = document.getElementById('registry-grid');
    await new Promise(r => setTimeout(r, 500));
    const resolvedId = window._eventId || eventId;
    try {
      const res = await fetch('/api/journey/registry?eventId=' + resolvedId);
      const data = await res.json();
      if (data.success && data.items) {
        if (data.items.length === 0) {
          grid.innerHTML = '<p class="loading">No gifts in the registry yet.</p>';
          return;
        }
        grid.innerHTML = data.items.map(item => {
          const isGone = item.status === 'gone' || item.claimed;
          return `
          <div class="registry-card ${isGone ? 'claimed' : ''}">
            ${item.image ? `<img class="registry-card__img" src="${item.image}" alt="${item.name}" onerror="this.style.display='none'" />` : ''}
            <div class="registry-card__body">
              <div class="registry-card__name">${item.name}</div>
              <div class="registry-card__price">${item.price || ''}</div>
              ${isGone
                ? `<div class="registry-card__gone-badge">GONE 🎉</div>
                   <div class="registry-card__claimed">Claimed by ${item.claimedBy || 'someone'}</div>`
                : `<button class="registry-card__btn" onclick="openClaimModal('${item.id}', '${item.name.replace(/'/g, "\\'")}')">I'll Get This!</button>`
              }
              ${item.amazonUrl || item.url ? `<a href="${item.amazonUrl || item.url}" target="_blank" class="registry-card__amazon">View on Amazon →</a>` : ''}
            </div>
          </div>`;
        }).join('');
      } else {
        grid.innerHTML = '<p class="loading">Could not load registry.</p>';
      }
    } catch (e) {
      grid.innerHTML = '<p class="loading">Could not load registry.</p>';
    }
  }

  // ─── RSVP ──────────────────────────────────────────────
  const rsvpForm = document.getElementById('rsvp-form');

  // Lookup existing RSVP by email
  window.lookupRsvp = async function () {
    const email = document.getElementById('rsvp-lookup-email').value.trim();
    const status = document.getElementById('rsvp-lookup-status');
    if (!email) { status.textContent = 'Please enter your email.'; status.style.color = '#991b1b'; return; }

    status.textContent = 'Looking up...';
    status.style.color = 'var(--muted)';

    try {
      const res = await fetch('/api/journey/rsvp-lookup?email=' + encodeURIComponent(email));
      const data = await res.json();
      if (data.success && data.rsvps && data.rsvps.length > 0) {
        const rsvp = data.rsvps[0];
        // Fill form with existing data
        document.getElementById('rsvp-id').value = rsvp.id;
        document.getElementById('rsvp-name').value = rsvp.name || '';
        document.getElementById('rsvp-email').value = rsvp.email || '';
        document.getElementById('rsvp-guests').value = rsvp.guests || 1;
        document.getElementById('rsvp-message').value = rsvp.message || '';
        document.getElementById('rsvp-submit-btn').textContent = 'Update RSVP';
        document.getElementById('rsvp-cancel-btn').style.display = 'inline-block';
        status.textContent = '✅ Found your RSVP! Edit below and click Update.';
        status.style.color = '#2a7c4f';
      } else {
        status.textContent = 'No existing RSVP found. Fill out the form below to RSVP!';
        status.style.color = 'var(--muted)';
        document.getElementById('rsvp-email').value = email;
      }
    } catch (e) {
      status.textContent = '⚠️ Could not look up. Try submitting a new RSVP.';
      status.style.color = '#B45309';
    }
  };

  // Submit / Update RSVP
  rsvpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resolvedId = window._eventId || eventId;
    const body = {
      eventId: resolvedId,
      name: document.getElementById('rsvp-name').value.trim(),
      email: document.getElementById('rsvp-email').value.trim(),
      guests: parseInt(document.getElementById('rsvp-guests').value) || 1,
      message: document.getElementById('rsvp-message').value.trim()
    };

    const existingId = document.getElementById('rsvp-id').value;
    if (existingId) body.id = existingId;

    try {
      const res = await fetch('/api/journey/rsvp', {
        method: existingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        rsvpForm.style.display = 'none';
        document.getElementById('rsvp-lookup').style.display = 'none';
        const successEl = document.getElementById('rsvp-success');
        successEl.style.display = 'block';
        document.getElementById('rsvp-success-msg').textContent = data.updated
          ? 'Your RSVP has been updated! See you there! 🎉'
          : 'Your RSVP has been received. We can\'t wait to see you!';
      } else {
        alert('Error: ' + (data.error || 'Could not submit RSVP'));
      }
    } catch (err) {
      alert('Connection error. Please try again.');
    }
  });

  // Cancel RSVP
  window.cancelRsvp = async function () {
    const id = document.getElementById('rsvp-id').value;
    if (!id) return;
    if (!confirm('Are you sure you want to cancel your RSVP?')) return;

    try {
      const res = await fetch('/api/journey/rsvp?id=' + id, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        rsvpForm.style.display = 'none';
        document.getElementById('rsvp-lookup').style.display = 'none';
        const successEl = document.getElementById('rsvp-success');
        successEl.style.display = 'block';
        document.getElementById('rsvp-success-msg').textContent = 'Your RSVP has been cancelled. We hope to see you next time! 💛';
      }
    } catch (e) {
      alert('Error cancelling RSVP.');
    }
  };

  // ─── Claim Modal ────────────────────────────────────────
  window.openClaimModal = function (id, name) {
    document.getElementById('claim-item-id').value = id;
    document.getElementById('claim-item-name').textContent = name;
    document.getElementById('claim-modal').style.display = 'flex';
  };

  window.closeClaimModal = function () {
    document.getElementById('claim-modal').style.display = 'none';
  };

  document.getElementById('claim-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('claim-item-id').value;
    const claimedBy = document.getElementById('claim-name').value.trim();
    const claimedEmail = document.getElementById('claim-email').value.trim();

    try {
      const res = await fetch('/api/journey/registry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, claimedBy, claimedEmail })
      });
      const data = await res.json();
      if (data.success) {
        closeClaimModal();
        loadRegistry();
      } else {
        alert('Error: ' + (data.error || 'Could not claim gift'));
      }
    } catch (err) {
      alert('Connection error. Please try again.');
    }
  });

  // Close modal on overlay click
  document.getElementById('claim-modal').addEventListener('click', (e) => {
    if (e.target.id === 'claim-modal') closeClaimModal();
  });
})();
