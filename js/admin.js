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
            <h3>${item.name} — ₹${item.price || '?'}</h3>
            <p>${item.claimed ? '✅ Claimed by ' + item.claimedBy : '⏳ Available'} ${item.url ? '| <a href="' + item.url + '" target="_blank">Amazon</a>' : ''}</p>
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
      if (rsvps.length === 0) { alert('No RSVPs yet for this event.'); return; }

      const totalGuests = rsvps.reduce((sum, r) => sum + (r.guests || 1), 0);
      let msg = `RSVPs (${rsvps.length} responses, ${totalGuests} total guests):\n\n`;
      rsvps.forEach(r => {
        msg += `• ${r.name} (${r.email}) — ${r.guests} guest(s)${r.message ? ' — "' + r.message + '"' : ''}\n`;
      });
      alert(msg);
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
