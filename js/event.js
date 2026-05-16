// Event page logic (RSVP + Registry)
(function () {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('id') || 'baby-shower';

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
        // Find by ID or fall back to first event
        const event = eventId ? data.events.find(e => e.id === eventId) : data.events[0];
        if (!event && data.events.length > 0) var evt = data.events[0]; else var evt = event;
        if (evt) {
          // Store the resolved event ID for registry loading
          window._eventId = evt.id;
          document.getElementById('event-title').textContent = evt.name || evt.title || 'Baby Shower';
          document.getElementById('event-date').textContent = evt.date || '';
          document.getElementById('event-description').textContent = evt.description || '';
          document.title = (evt.name || evt.title || 'Event') + ' — Shravek Journey';
        }
      }
    } catch (e) {
      console.log('Could not load event info');
    }
  }

  async function loadRegistry() {
    const grid = document.getElementById('registry-grid');
    // Wait for event to resolve its ID
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
        grid.innerHTML = data.items.map(item => `
          <div class="registry-card ${item.status === 'gone' ? 'claimed' : ''}">
            ${item.image ? `<img class="registry-card__img" src="${item.image}" alt="${item.name}" />` : ''}
            <div class="registry-card__body">
              <div class="registry-card__name">${item.name}</div>
              <div class="registry-card__price">${item.price || '—'}</div>
              ${item.status === 'gone'
                ? `<button class="registry-card__btn gone" disabled>Gone! 🎉</button>
                   <div class="registry-card__claimed">Claimed by ${item.bookedBy || 'someone'}</div>`
                : `<button class="registry-card__btn" onclick="openClaimModal('${item.id}', '${item.name.replace(/'/g, "\\'")}')">I'll Get This!</button>`
              }
              ${item.amazonUrl ? `<a href="${item.amazonUrl}" target="_blank" style="display:block;text-align:center;font-size:0.75rem;margin-top:0.5rem;color:var(--rose)">View on Amazon →</a>` : ''}
            </div>
          </div>
        `).join('');
      } else {
        grid.innerHTML = '<p class="loading">Could not load registry.</p>';
      }
    } catch (e) {
      grid.innerHTML = '<p class="loading">Could not load registry.</p>';
    }
  }

  // RSVP form
  document.getElementById('rsvp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      eventId,
      name: document.getElementById('rsvp-name').value.trim(),
      email: document.getElementById('rsvp-email').value.trim(),
      guests: parseInt(document.getElementById('rsvp-guests').value) || 1,
      message: document.getElementById('rsvp-message').value.trim()
    };

    try {
      const res = await fetch('/api/journey/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('rsvp-form').style.display = 'none';
        document.getElementById('rsvp-success').style.display = 'block';
      } else {
        alert('Error: ' + (data.error || 'Could not submit RSVP'));
      }
    } catch (err) {
      alert('Connection error. Please try again.');
    }
  });

  // Claim modal
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
        loadRegistry(); // Refresh
      } else {
        alert('Error: ' + (data.error || 'Could not claim gift'));
      }
    } catch (err) {
      alert('Connection error. Please try again.');
    }
  });
})();
