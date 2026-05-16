// Admin Panel JS
(function () {
  const API = '/api/journey';
  const token = localStorage.getItem('adminToken');

  // Auth check
  if (!token) { window.location.href = 'login.html'; return; }
  fetch(API + '/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  }).then(r => r.json()).then(d => {
    if (!d.success) { localStorage.clear(); window.location.href = 'login.html'; }
  }).catch(() => {});

  // Tab navigation
  document.querySelectorAll('.sidebar__link').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar__link').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // Load all data
  loadAll();

  async function loadAll() {
    loadCategory('timeline');
    loadCategory('travel');
    loadCategory('baby');
    loadPhotos();
    loadEvents();
  }

  // ─── Generic Category CRUD ───────────────────────────────
  async function loadCategory(cat) {
    const list = document.getElementById('list-' + cat);
    if (!list) return;
    try {
      const res = await fetch(API + '/' + cat);
      const data = await res.json();
      const items = data.items || [];
      list.innerHTML = items.map(item => `
        <div class="admin-item">
          <div class="admin-item__info">
            <h3>${item.icon || ''} ${item.title || item.destination || ''}</h3>
            <p>${item.date || item.month || ''} — ${(item.description || '').substring(0, 60)}...</p>
          </div>
          <div class="admin-item__actions">
            <button onclick="deleteItem('${item.id}','${cat}')">Delete</button>
          </div>
        </div>
      `).join('') || '<p style="color:var(--muted);font-size:0.9rem">No items yet.</p>';
    } catch (e) {
      list.innerHTML = '<p style="color:#991b1b">Error loading data.</p>';
    }
  }

  window.showForm = function (cat) {
    document.getElementById('form-' + cat).style.display = 'block';
  };
  window.hideForm = function (cat) {
    document.getElementById('form-' + cat).style.display = 'none';
  };

  window.saveItem = async function (e, cat) {
    e.preventDefault();
    const body = {};
    const fields = {
      timeline: ['title', 'date', 'icon', 'order', 'description', 'photoUrl'],
      travel: ['destination', 'date', 'icon', 'order', 'description', 'photoUrl'],
      baby: ['title', 'month', 'icon', 'order', 'description', 'photoUrl']
    };
    (fields[cat] || []).forEach(f => {
      const el = document.getElementById(cat + '-' + f);
      if (el && el.value.trim()) body[f] = f === 'order' ? parseInt(el.value) : el.value.trim();
    });

    const res = await fetch(API + '/' + cat, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) {
      showStatus('Item saved!');
      hideForm(cat);
      e.target.reset();
      loadCategory(cat);
    } else {
      alert('Error: ' + (data.error || 'Failed'));
    }
  };

  window.deleteItem = async function (id, cat) {
    if (!confirm('Delete this item?')) return;
    const res = await fetch(API + '/' + cat + '?id=' + id + '&category=' + cat, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { showStatus('Deleted!'); loadCategory(cat); }
    else alert('Error: ' + (data.error || 'Failed'));
  };

  // ─── Photos ──────────────────────────────────────────────
  async function loadPhotos() {
    const list = document.getElementById('list-photos');
    if (!list) return;
    try {
      const res = await fetch(API + '/photos');
      const data = await res.json();
      const photos = data.photos || [];
      list.innerHTML = photos.map(p => `
        <div class="photo-admin-card">
          ${p.url ? `<img src="${p.url}" alt="${p.caption || ''}" />` : `<div style="height:140px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:2rem">${p.emoji || '📷'}</div>`}
          <div class="photo-admin-card__body">
            <div class="photo-admin-card__caption">${p.caption || 'No caption'}</div>
            <div class="photo-admin-card__album">${p.album || 'general'}</div>
            <button style="font-size:0.7rem;cursor:pointer" onclick="deletePhoto('${p.id}')">Delete</button>
          </div>
        </div>
      `).join('') || '<p style="color:var(--muted)">No photos yet.</p>';
    } catch (e) {
      list.innerHTML = '<p style="color:#991b1b">Error loading photos.</p>';
    }
  }

  window.savePhoto = async function (e) {
    e.preventDefault();
    const body = {
      album: document.getElementById('photo-album').value.trim(),
      caption: document.getElementById('photo-caption').value.trim(),
      url: document.getElementById('photo-url').value.trim(),
      order: parseInt(document.getElementById('photo-order').value) || 0
    };
    const res = await fetch(API + '/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) { showStatus('Photo added!'); hideForm('photos'); e.target.reset(); loadPhotos(); }
    else alert('Error: ' + (data.error || 'Failed'));
  };

  window.deletePhoto = async function (id) {
    if (!confirm('Delete this photo?')) return;
    const res = await fetch(API + '/photos?id=' + id, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { showStatus('Deleted!'); loadPhotos(); }
    else alert('Error: ' + (data.error || 'Failed'));
  };

  // ─── Events ──────────────────────────────────────────────
  async function loadEvents() {
    const list = document.getElementById('list-events');
    if (!list) return;
    try {
      const res = await fetch(API + '/events');
      const data = await res.json();
      const events = data.events || [];
      list.innerHTML = events.map(ev => `
        <div class="admin-item">
          <div class="admin-item__info">
            <h3>${ev.name || ev.title}</h3>
            <p>${ev.date || ''} — <a href="event.html?id=${ev.id}" target="_blank">View public page →</a></p>
          </div>
          <div class="admin-item__actions">
            <button onclick="manageEvent('${ev.id}','${(ev.name || ev.title || '').replace(/'/g, "\\'")}')">Registry</button>
            <button onclick="viewRsvps('${ev.id}')">RSVPs</button>
            <button class="btn-danger" onclick="deleteEvent('${ev.id}')">Delete</button>
          </div>
        </div>
      `).join('') || '<p style="color:var(--muted)">No events yet. Create one!</p>';
    } catch (e) {
      list.innerHTML = '<p style="color:#991b1b">Error loading events.</p>';
    }
  }

  window.showEventForm = function () {
    document.getElementById('form-events').style.display = 'block';
  };
  window.hideEventForm = function () {
    document.getElementById('form-events').style.display = 'none';
  };

  window.saveEvent = async function (e) {
    e.preventDefault();
    const body = {
      name: document.getElementById('event-title-input').value.trim(),
      date: document.getElementById('event-date-input').value.trim(),
      description: document.getElementById('event-desc-input').value.trim(),
      type: document.getElementById('event-type-input').value
    };
    // Use title as ID (kebab-case)
    body.id = body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    const res = await fetch(API + '/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) { showStatus('Event created!'); hideEventForm(); e.target.reset(); loadEvents(); }
    else alert('Error: ' + (data.error || 'Failed'));
  };

  window.deleteEvent = async function (id) {
    if (!confirm('Delete this event and all its data?')) return;
    const res = await fetch(API + '/events?id=' + id, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { showStatus('Event deleted!'); loadEvents(); }
    else alert('Error: ' + (data.error || 'Failed'));
  };

  // ─── Registry Management ─────────────────────────────────
  window.manageEvent = async function (eventId, title) {
    document.getElementById('registry-mgmt').style.display = 'block';
    document.getElementById('registry-event-title').textContent = title;
    document.getElementById('registry-event-id').value = eventId;
    loadRegistryItems(eventId);
  };

  async function loadRegistryItems(eventId) {
    const list = document.getElementById('list-registry');
    try {
      const res = await fetch(API + '/registry?eventId=' + eventId);
      const data = await res.json();
      const items = data.items || [];
      list.innerHTML = items.map(item => `
        <div class="admin-item">
          <div class="admin-item__info">
            <h3>${item.name} — ${item.price || '?'}</h3>
            <p>${item.claimed || item.status === 'gone' ? '✅ Claimed by <strong>' + (item.claimedBy || '?') + '</strong> (' + (item.claimedEmail || '—') + ')' : '⏳ Available'} ${item.amazonUrl || item.url ? '| <a href="' + (item.amazonUrl || item.url) + '" target="_blank">Amazon</a>' : ''}</p>
          </div>
          <div class="admin-item__actions">
            <button class="btn-danger" onclick="deleteRegistryItem('${item.id}','${eventId}')">Delete</button>
          </div>
        </div>
      `).join('') || '<p style="color:var(--muted)">No registry items. Add some!</p>';
    } catch (e) {
      list.innerHTML = '<p style="color:#991b1b">Error loading registry.</p>';
    }
  }

  window.saveRegistryItem = async function (e) {
    e.preventDefault();
    const eventId = document.getElementById('registry-event-id').value;
    const body = {
      eventId,
      name: document.getElementById('reg-item-name').value.trim(),
      price: document.getElementById('reg-item-price').value.trim(),
      url: document.getElementById('reg-item-url').value.trim(),
      imageUrl: document.getElementById('reg-item-image').value.trim(),
      order: parseInt(document.getElementById('reg-item-order').value) || 0
    };
    const res = await fetch(API + '/registry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) { showStatus('Item added!'); e.target.reset(); loadRegistryItems(eventId); }
    else alert('Error: ' + (data.error || 'Failed'));
  };

  // ─── Amazon Import ──────────────────────────────────────
  window.importFromAmazon = async function () {
    const urlInput = document.getElementById('amazon-import-url');
    const status = document.getElementById('amazon-import-status');
    const url = urlInput.value.trim();

    if (!url || (!url.includes('amazon.in') && !url.includes('amazon.com') && !url.includes('amzn.'))) {
      status.textContent = '❌ Please paste a valid Amazon product URL';
      status.style.color = '#991b1b';
      return;
    }

    status.textContent = '⏳ Fetching product details...';
    status.style.color = 'var(--muted)';

    try {
      const res = await fetch(API + '/scrape-amazon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();

      if (data.success && data.product) {
        // Auto-fill the form
        document.getElementById('reg-item-name').value = data.product.name || '';
        document.getElementById('reg-item-price').value = data.product.price || '';
        document.getElementById('reg-item-url').value = url;
        document.getElementById('reg-item-image').value = data.product.image || '';
        status.textContent = '✅ Product details imported! Review and click "Add to Registry"';
        status.style.color = '#2a7c4f';
        urlInput.value = '';
      } else {
        status.textContent = '⚠️ Could not fetch details. Fill manually below (URL is set).';
        status.style.color = '#B45309';
        document.getElementById('reg-item-url').value = url;
      }
    } catch (e) {
      status.textContent = '⚠️ Import failed. Fill manually below (URL is set).';
      status.style.color = '#B45309';
      document.getElementById('reg-item-url').value = url;
    }
  };

  window.deleteRegistryItem = async function (id, eventId) {
    if (!confirm('Delete this registry item?')) return;
    const res = await fetch(API + '/registry?id=' + id, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { showStatus('Deleted!'); loadRegistryItems(eventId); }
    else alert('Error: ' + (data.error || 'Failed'));
  };

  // ─── RSVP Viewing ────────────────────────────────────────
  window.viewRsvps = async function (eventId) {
    try {
      const res = await fetch(API + '/rsvp?eventId=' + eventId);
      const data = await res.json();
      const rsvps = data.rsvps || [];

      // Show RSVPs inline below the events list
      let container = document.getElementById('rsvp-panel');
      if (!container) {
        container = document.createElement('div');
        container.id = 'rsvp-panel';
        container.className = 'admin-card';
        container.style.marginTop = '2rem';
        document.getElementById('list-events').parentNode.appendChild(container);
      }
      container.style.display = 'block';

      if (rsvps.length === 0) {
        container.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
            <h3 class="admin-card__title" style="margin:0">RSVPs</h3>
            <button onclick="document.getElementById('rsvp-panel').style.display='none'" style="background:none;border:none;font-size:1.2rem;cursor:pointer">✕</button>
          </div>
          <p style="color:var(--muted)">No RSVPs yet for this event.</p>`;
        return;
      }

      const totalGuests = rsvps.reduce((sum, r) => sum + (r.guests || 1), 0);
      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <h3 class="admin-card__title" style="margin:0">RSVPs — ${rsvps.length} responses, ${totalGuests} guests</h3>
          <button onclick="document.getElementById('rsvp-panel').style.display='none'" style="background:none;border:none;font-size:1.2rem;cursor:pointer">✕</button>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
          <thead>
            <tr style="text-align:left;border-bottom:2px solid var(--border)">
              <th style="padding:0.5rem">Name</th>
              <th style="padding:0.5rem">Email</th>
              <th style="padding:0.5rem">Guests</th>
              <th style="padding:0.5rem">Message</th>
              <th style="padding:0.5rem">Date</th>
            </tr>
          </thead>
          <tbody>
            ${rsvps.map(r => `
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:0.5rem;font-weight:500">${r.name || '—'}</td>
                <td style="padding:0.5rem">${r.email || '—'}</td>
                <td style="padding:0.5rem;text-align:center">${r.guests || 1}</td>
                <td style="padding:0.5rem;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis">${r.message || '—'}</td>
                <td style="padding:0.5rem;font-size:0.75rem">${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    } catch (e) {
      alert('Error loading RSVPs');
    }
  };

  // ─── Logout ──────────────────────────────────────────────
  window.adminLogout = function () {
    localStorage.clear();
    window.location.href = 'login.html';
  };

  // ─── Status Message ──────────────────────────────────────
  function showStatus(msg) {
    const el = document.createElement('div');
    el.className = 'status-msg';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
})();
