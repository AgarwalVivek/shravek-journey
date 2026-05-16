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

  // ─── Hero Photos ────────────────────────────────────────
  async function loadSettings() {
    try {
      const res = await fetch(API + '/settings');
      const data = await res.json();
      if (data.success && data.settings) {
        const s = data.settings;
        if (s.heroPhotoLeft) {
          document.getElementById('hero-photo-left').value = s.heroPhotoLeft;
          document.getElementById('hero-left-preview').src = s.heroPhotoLeft;
          document.getElementById('hero-left-preview').style.display = 'block';
          document.getElementById('hero-left-placeholder').style.display = 'none';
        }
        if (s.heroPhotoRight) {
          document.getElementById('hero-photo-right').value = s.heroPhotoRight;
          document.getElementById('hero-right-preview').src = s.heroPhotoRight;
          document.getElementById('hero-right-preview').style.display = 'block';
          document.getElementById('hero-right-placeholder').style.display = 'none';
        }
        if (s.heroPhotoLeftAlt) document.getElementById('hero-photo-left-alt').value = s.heroPhotoLeftAlt;
        if (s.heroPhotoRightAlt) document.getElementById('hero-photo-right-alt').value = s.heroPhotoRightAlt;
      }
    } catch (e) {
      console.error('Error loading settings:', e);
    }
  }

  // Live preview when URL changes
  ['hero-photo-left', 'hero-photo-right'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        const side = id.includes('left') ? 'left' : 'right';
        const preview = document.getElementById('hero-' + side + '-preview');
        const placeholder = document.getElementById('hero-' + side + '-placeholder');
        if (el.value.trim()) {
          preview.src = el.value.trim();
          preview.style.display = 'block';
          placeholder.style.display = 'none';
          preview.onerror = () => { preview.style.display = 'none'; placeholder.style.display = 'flex'; };
        } else {
          preview.style.display = 'none';
          placeholder.style.display = 'flex';
        }
      });
    }
  });

  // Upload hero photo directly
  window.uploadHeroPhoto = async function (side, file) {
    if (!file) return;
    const status = document.getElementById('hero-save-status');
    const progressDiv = document.getElementById('hero-' + side + '-progress');
    const progressBar = document.getElementById('hero-' + side + '-bar');

    status.textContent = '⏳ Uploading ' + file.name + '...';
    status.style.color = 'var(--muted)';
    progressDiv.style.display = 'block';
    progressBar.style.width = '10%';

    try {
      // Get SAS upload URL from API
      const sasRes = await fetch(API + '/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'hero-' + side + '-' + Date.now() + '.' + file.name.split('.').pop(), contentType: file.type, folder: 'hero' })
      });
      const sasData = await sasRes.json();
      if (!sasData.success) throw new Error(sasData.error || 'Failed to get upload URL');
      progressBar.style.width = '30%';

      // Upload directly to blob storage
      const uploadRes = await fetch(sasData.uploadUrl, {
        method: 'PUT',
        headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': file.type },
        body: file
      });
      if (!uploadRes.ok) throw new Error('Upload failed: ' + uploadRes.status);
      progressBar.style.width = '80%';

      // Set the URL in the form
      document.getElementById('hero-photo-' + side).value = sasData.blobUrl;

      // Update preview
      const preview = document.getElementById('hero-' + side + '-preview');
      const placeholder = document.getElementById('hero-' + side + '-placeholder');
      preview.src = sasData.blobUrl;
      preview.style.display = 'block';
      placeholder.style.display = 'none';

      progressBar.style.width = '100%';
      status.textContent = '✅ Uploaded! Click "Save Hero Photos" to apply.';
      status.style.color = '#2a7c4f';
      setTimeout(() => { progressDiv.style.display = 'none'; }, 2000);
    } catch (e) {
      status.textContent = '❌ Upload failed: ' + e.message;
      status.style.color = '#991b1b';
      progressDiv.style.display = 'none';
    }
  };

  // Drag & drop support for hero photo panels
  ['left', 'right'].forEach(side => {
    const placeholder = document.getElementById('hero-' + side + '-placeholder');
    if (!placeholder) return;
    placeholder.addEventListener('dragover', (e) => { e.preventDefault(); placeholder.style.borderColor = 'var(--teal)'; placeholder.style.background = 'rgba(74,124,126,0.05)'; });
    placeholder.addEventListener('dragleave', () => { placeholder.style.borderColor = '#ccc'; placeholder.style.background = ''; });
    placeholder.addEventListener('drop', (e) => {
      e.preventDefault();
      placeholder.style.borderColor = '#ccc';
      placeholder.style.background = '';
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) uploadHeroPhoto(side, file);
    });
  });

  window.saveHeroPhotos = async function (e) {
    e.preventDefault();
    const status = document.getElementById('hero-save-status');
    status.textContent = '⏳ Saving...';
    status.style.color = 'var(--muted)';

    const body = {
      heroPhotoLeft: document.getElementById('hero-photo-left').value.trim(),
      heroPhotoRight: document.getElementById('hero-photo-right').value.trim(),
      heroPhotoLeftAlt: document.getElementById('hero-photo-left-alt').value.trim(),
      heroPhotoRightAlt: document.getElementById('hero-photo-right-alt').value.trim()
    };

    try {
      const res = await fetch(API + '/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        status.textContent = '✅ Hero photos saved! Changes will appear on the homepage.';
        status.style.color = '#2a7c4f';
      } else {
        status.textContent = '❌ ' + (data.error || 'Failed to save');
        status.style.color = '#991b1b';
      }
    } catch (e) {
      status.textContent = '❌ Network error';
      status.style.color = '#991b1b';
    }
  };

  // ─── Password Change ───────────────────────────────────
  window.changePassword = async function (e) {
    e.preventDefault();
    const status = document.getElementById('password-save-status');
    const newPw = document.getElementById('new-password').value;
    const confirmPw = document.getElementById('confirm-password').value;

    if (newPw !== confirmPw) {
      status.textContent = '❌ Passwords do not match';
      status.style.color = '#991b1b';
      return;
    }

    status.textContent = '⏳ Updating...';
    status.style.color = 'var(--muted)';

    const body = {
      currentPassword: document.getElementById('current-password').value,
      newPassword: newPw,
      totpCode: document.getElementById('totp-code').value.trim() || undefined
    };

    try {
      const res = await fetch(API + '/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        status.textContent = '✅ ' + data.message;
        status.style.color = '#2a7c4f';
        setTimeout(() => { localStorage.clear(); window.location.href = 'login.html'; }, 2000);
      } else if (data.requires2FA) {
        // Show TOTP input field
        document.getElementById('totp-code-group').style.display = 'block';
        document.getElementById('totp-code').focus();
        status.textContent = '🛡️ Enter your Google Authenticator code to proceed';
        status.style.color = '#B45309';
      } else {
        status.textContent = '❌ ' + (data.error || 'Failed');
        status.style.color = '#991b1b';
      }
    } catch (e) {
      status.textContent = '❌ Network error';
      status.style.color = '#991b1b';
    }
  };

  // ─── 2FA Management ────────────────────────────────────
  async function load2FAStatus() {
    try {
      const res = await fetch(API + '/2fa-status?token=' + token);
      const data = await res.json();
      const badge = document.getElementById('2fa-badge');
      if (data.success && data.enabled) {
        badge.textContent = '✅ 2FA Enabled';
        badge.style.background = '#dcfce7';
        badge.style.color = '#166534';
        document.getElementById('2fa-setup-section').style.display = 'none';
        document.getElementById('2fa-disable-section').style.display = 'block';
        document.getElementById('totp-code-group').style.display = 'block';
      } else {
        badge.textContent = '⚠️ 2FA Not Enabled';
        badge.style.background = '#fef3c7';
        badge.style.color = '#92400e';
        document.getElementById('2fa-setup-section').style.display = 'block';
        document.getElementById('2fa-disable-section').style.display = 'none';
        document.getElementById('totp-code-group').style.display = 'none';
      }
    } catch (e) {
      console.error('Error checking 2FA status:', e);
    }
  }

  window.start2FASetup = async function () {
    const statusMsg = document.getElementById('2fa-status-msg');
    statusMsg.textContent = '⏳ Generating QR code...';
    statusMsg.style.color = 'var(--muted)';

    try {
      const res = await fetch(API + '/setup-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('2fa-qr-image').src = data.qrCode;
        document.getElementById('2fa-manual-key').textContent = data.secret;
        document.getElementById('2fa-qr-section').style.display = 'block';
        document.getElementById('2fa-setup-section').style.display = 'none';
        statusMsg.textContent = '';
      } else {
        statusMsg.textContent = '❌ ' + (data.error || 'Failed');
        statusMsg.style.color = '#991b1b';
      }
    } catch (e) {
      statusMsg.textContent = '❌ Network error';
      statusMsg.style.color = '#991b1b';
    }
  };

  window.verify2FASetup = async function () {
    const code = document.getElementById('2fa-verify-code').value.trim();
    const statusMsg = document.getElementById('2fa-status-msg');

    if (!code || code.length !== 6) {
      statusMsg.textContent = '❌ Enter the 6-digit code from Google Authenticator';
      statusMsg.style.color = '#991b1b';
      return;
    }

    statusMsg.textContent = '⏳ Verifying...';
    statusMsg.style.color = 'var(--muted)';

    try {
      const res = await fetch(API + '/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, code })
      });
      const data = await res.json();
      if (data.success) {
        statusMsg.textContent = '✅ ' + data.message;
        statusMsg.style.color = '#2a7c4f';
        document.getElementById('2fa-qr-section').style.display = 'none';
        load2FAStatus();
      } else {
        statusMsg.textContent = '❌ ' + (data.error || 'Invalid code');
        statusMsg.style.color = '#991b1b';
      }
    } catch (e) {
      statusMsg.textContent = '❌ Network error';
      statusMsg.style.color = '#991b1b';
    }
  };

  window.cancel2FASetup = function () {
    document.getElementById('2fa-qr-section').style.display = 'none';
    document.getElementById('2fa-setup-section').style.display = 'block';
    document.getElementById('2fa-status-msg').textContent = '';
  };

  window.disable2FA = async function () {
    const code = document.getElementById('2fa-disable-code').value.trim();
    const statusMsg = document.getElementById('2fa-status-msg');

    if (!code || code.length !== 6) {
      statusMsg.textContent = '❌ Enter the 6-digit code from Google Authenticator';
      statusMsg.style.color = '#991b1b';
      return;
    }

    if (!confirm('Are you sure you want to disable 2FA? Password changes will no longer require an authenticator code.')) return;

    statusMsg.textContent = '⏳ Disabling...';
    try {
      const res = await fetch(API + '/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, code, action: 'disable' })
      });
      const data = await res.json();
      if (data.success) {
        statusMsg.textContent = '✅ ' + data.message;
        statusMsg.style.color = '#2a7c4f';
        load2FAStatus();
      } else {
        statusMsg.textContent = '❌ ' + (data.error || 'Failed');
        statusMsg.style.color = '#991b1b';
      }
    } catch (e) {
      statusMsg.textContent = '❌ Network error';
      statusMsg.style.color = '#991b1b';
    }
  };

  // Load settings and 2FA status on page load
  loadSettings();
  load2FAStatus();

  // ─── Status Message ──────────────────────────────────────
  function showStatus(msg) {
    const el = document.createElement('div');
    el.className = 'status-msg';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
})();
