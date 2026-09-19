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

  function adminHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  function escapeAdminHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let currentEmailCampaign;
  const maxShareCollagePhotos = 4;
  const shareCollagePhotos = ((window.PREGNANCY_MEDIA && window.PREGNANCY_MEDIA['month-7']) || [])
    .filter(photo => photo.type === 'image')
    .map((photo, index) => ({ ...photo, index }));
  let selectedShareCollagePhotos = [];
  let visibleShareCollagePhotos = 72;
  let collageRenderVersion = 0;
  let cachedShareCollage;
  let shareCollagePreviewError;

  function invalidateShareCollage() {
    cachedShareCollage = null;
  }

  function drawImageCover(context, image, x, y, width, height) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const sourceX = (image.naturalWidth - sourceWidth) / 2;
    const sourceY = (image.naturalHeight - sourceHeight) / 2;
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  }

  function loadCollageImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('One of the selected photos could not be loaded.'));
      image.src = url;
    });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
      reader.readAsDataURL(file);
    });
  }

  async function prepareLocalSharePhoto(file) {
    if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
    if (file.size > 30 * 1024 * 1024) throw new Error(`${file.name} is larger than 30 MB.`);

    const originalUrl = await fileToDataUrl(file);
    const image = await loadCollageImage(originalUrl);
    const maxDimension = 2000;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    if (scale === 1) return originalUrl;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.88);
  }

  function collagePhotoFrames(count) {
    const left = 70;
    const top = 245;
    const width = 940;
    const height = 800;
    const gap = 18;
    const halfWidth = (width - gap) / 2;
    const halfHeight = (height - gap) / 2;

    if (count === 1) return [{ x: left, y: top, width, height }];
    if (count === 2) {
      return [
        { x: left, y: top, width: halfWidth, height },
        { x: left + halfWidth + gap, y: top, width: halfWidth, height }
      ];
    }
    if (count === 3) {
      return [
        { x: left, y: top, width, height: halfHeight },
        { x: left, y: top + halfHeight + gap, width: halfWidth, height: halfHeight },
        { x: left + halfWidth + gap, y: top + halfHeight + gap, width: halfWidth, height: halfHeight }
      ];
    }
    return [
      { x: left, y: top, width: halfWidth, height: halfHeight },
      { x: left + halfWidth + gap, y: top, width: halfWidth, height: halfHeight },
      { x: left, y: top + halfHeight + gap, width: halfWidth, height: halfHeight },
      { x: left + halfWidth + gap, y: top + halfHeight + gap, width: halfWidth, height: halfHeight }
    ];
  }

  async function renderShareCollagePreview() {
    const canvas = document.getElementById('share-collage-canvas');
    const previewStatus = document.getElementById('share-collage-preview-status');
    const downloadButton = document.getElementById('share-collage-download');
    if (!canvas || !previewStatus || !downloadButton) return;

    const renderVersion = ++collageRenderVersion;
    shareCollagePreviewError = null;
    const context = canvas.getContext('2d');
    const recipientName = document.getElementById('video-share-name').value.trim();
    const firstName = (recipientName ? recipientName.split(/\s+/)[0] : 'Friend').slice(0, 20);
    context.fillStyle = '#f8f1f3';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    context.fillStyle = '#b96580';
    context.font = '500 24px Arial, sans-serif';
    context.fillText('TINY TOES & PRETTY BOWS', canvas.width / 2, 72);
    context.fillStyle = '#2a1d23';
    context.font = '54px Georgia, serif';
    context.fillText(`${firstName}, you were part of our story`, canvas.width / 2, 145);
    context.fillStyle = '#806671';
    context.font = 'italic 28px Georgia, serif';
    context.fillText('A few memories from our Baby Shower', canvas.width / 2, 195);

    if (!selectedShareCollagePhotos.length) {
      context.strokeStyle = '#d7c6cc';
      context.lineWidth = 3;
      context.setLineDash([14, 12]);
      context.strokeRect(70, 245, 940, 800);
      context.setLineDash([]);
      context.fillStyle = '#9b858e';
      context.font = '32px Arial, sans-serif';
      context.fillText('Select up to four photos', canvas.width / 2, 650);
      context.font = '24px Arial, sans-serif';
      context.fillText('that feature this guest', canvas.width / 2, 692);
      previewStatus.textContent = 'Select 1–4 photos to create the collage.';
      previewStatus.style.color = 'var(--muted)';
      downloadButton.disabled = true;
    } else {
      previewStatus.textContent = 'Building preview...';
      downloadButton.disabled = true;
      try {
        const images = await Promise.all(selectedShareCollagePhotos.map(photo => loadCollageImage(photo.url)));
        if (renderVersion !== collageRenderVersion) return;
        const frames = collagePhotoFrames(images.length);
        images.forEach((image, index) => {
          const frame = frames[index];
          context.save();
          context.beginPath();
          context.rect(frame.x, frame.y, frame.width, frame.height);
          context.clip();
          drawImageCover(context, image, frame.x, frame.y, frame.width, frame.height);
          context.restore();
        });
        context.fillStyle = '#2a1d23';
        context.font = '46px Georgia, serif';
        context.fillText('Watch “Before We Met You”', canvas.width / 2, 1135);
        context.fillStyle = '#806671';
        context.font = '26px Arial, sans-serif';
        context.fillText('Find yourself in the film and complete photo album', canvas.width / 2, 1190);
        context.fillStyle = '#a95773';
        context.font = '500 25px Arial, sans-serif';
        context.fillText('shravek.com/babyshower-memories.html', canvas.width / 2, 1260);
        previewStatus.textContent = 'Collage ready. It will be personalized again before sending.';
        previewStatus.style.color = 'var(--muted)';
        downloadButton.disabled = false;
      } catch (error) {
        shareCollagePreviewError = error;
        previewStatus.textContent = error.message;
        previewStatus.style.color = '#991b1b';
        downloadButton.disabled = true;
      }
    }
  }

  function renderShareCollagePhotoGrid() {
    const grid = document.getElementById('share-collage-photo-grid');
    const localSelection = document.getElementById('share-collage-local-selection');
    const loadMoreButton = document.getElementById('share-collage-load-more');
    const count = document.getElementById('share-collage-selection-count');
    if (!grid || !localSelection || !loadMoreButton || !count) return;

    const query = document.getElementById('share-collage-search').value.trim().toLowerCase();
    const filtered = shareCollagePhotos.filter(photo => {
      const searchable = `${photo.order} ${photo.sourceName || ''} ${photo.alt || ''}`.toLowerCase();
      return !query || searchable.includes(query);
    });
    const visible = filtered.slice(0, visibleShareCollagePhotos);

    function photoButton(photo) {
      const selected = selectedShareCollagePhotos.some(item => item.url === photo.url);
      return `
        <button type="button" class="share-collage-photo${selected ? ' is-selected' : ''}" onclick="toggleShareCollagePhoto(${photo.index})" aria-pressed="${selected}" title="${escapeAdminHtml(photo.sourceName || photo.alt)}">
          <img src="${photo.url}" alt="${escapeAdminHtml(photo.alt || `Baby Shower photo ${photo.order}`)}" loading="lazy" />
          <span class="share-collage-photo__check" aria-hidden="true">✓</span>
        </button>
      `;
    }

    grid.innerHTML = visible.map(photo => photoButton(photo)).join('') ||
      '<p style="color:var(--muted)">No matching website photos.</p>';

    const localPhotos = selectedShareCollagePhotos.filter(photo => photo.local);
    localSelection.hidden = localPhotos.length === 0;
    localSelection.innerHTML = localPhotos.map(photo => `
      <div class="share-collage-local-photo">
        <img src="${photo.url}" alt="${escapeAdminHtml(photo.alt)}" />
        <span title="${escapeAdminHtml(photo.sourceName)}">${escapeAdminHtml(photo.sourceName)}</span>
        <button type="button" onclick="removeLocalShareCollagePhoto('${photo.index}')" aria-label="Remove ${escapeAdminHtml(photo.sourceName)}">Remove</button>
      </div>
    `).join('');

    count.textContent = `${selectedShareCollagePhotos.length} of ${maxShareCollagePhotos} selected`;
    loadMoreButton.hidden = visible.length >= filtered.length;
  }

  window.addLocalShareCollagePhotos = async function (event) {
    const input = event.target;
    const files = Array.from(input.files || []);
    const status = document.getElementById('video-share-status');
    const availableSlots = maxShareCollagePhotos - selectedShareCollagePhotos.length;
    input.value = '';

    if (!files.length) return;
    if (availableSlots <= 0) {
      status.textContent = 'Clear or remove a selected photo before browsing for another.';
      status.style.color = '#9a6718';
      return;
    }

    const selectedFiles = files.slice(0, availableSlots);
    status.textContent = `Preparing ${selectedFiles.length} local photo${selectedFiles.length === 1 ? '' : 's'}...`;
    status.style.color = 'var(--muted)';
    try {
      const preparedPhotos = [];
      for (const [index, file] of selectedFiles.entries()) {
        preparedPhotos.push({
          index: `local-${Date.now()}-${index}`,
          sourceName: file.name,
          alt: `Local photo ${file.name}`,
          url: await prepareLocalSharePhoto(file),
          local: true
        });
      }
      selectedShareCollagePhotos.push(...preparedPhotos);
      invalidateShareCollage();
      renderShareCollagePhotoGrid();
      await renderShareCollagePreview();
      status.textContent = files.length > selectedFiles.length
        ? `Added ${selectedFiles.length} local photos. A collage can contain up to four photos.`
        : `Added ${selectedFiles.length} local photo${selectedFiles.length === 1 ? '' : 's'}.`;
      status.style.color = files.length > selectedFiles.length ? '#9a6718' : '#2a7c4f';
    } catch (error) {
      status.textContent = error.message;
      status.style.color = '#991b1b';
    }
  };

  window.removeLocalShareCollagePhoto = function (id) {
    selectedShareCollagePhotos = selectedShareCollagePhotos.filter(photo => photo.index !== id);
    invalidateShareCollage();
    renderShareCollagePhotoGrid();
    renderShareCollagePreview();
  };

  window.toggleShareCollagePhoto = function (index) {
    const photo = shareCollagePhotos.find(item => item.index === index);
    if (!photo) return;
    const selectedIndex = selectedShareCollagePhotos.findIndex(item => item.url === photo.url);
    if (selectedIndex >= 0) {
      selectedShareCollagePhotos.splice(selectedIndex, 1);
    } else if (selectedShareCollagePhotos.length < maxShareCollagePhotos) {
      selectedShareCollagePhotos.push(photo);
    } else {
      const status = document.getElementById('video-share-status');
      status.textContent = 'Choose up to four photos for one clear, readable collage.';
      status.style.color = '#9a6718';
      return;
    }
    invalidateShareCollage();
    renderShareCollagePhotoGrid();
    renderShareCollagePreview();
  };

  window.loadMoreShareCollagePhotos = function () {
    visibleShareCollagePhotos += 72;
    renderShareCollagePhotoGrid();
  };

  window.clearShareCollage = function () {
    selectedShareCollagePhotos = [];
    invalidateShareCollage();
    renderShareCollagePhotoGrid();
    renderShareCollagePreview();
  };

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('The collage could not be generated.'));
      }, 'image/jpeg', 0.88);
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('The collage could not be prepared for email.'));
      reader.readAsDataURL(blob);
    });
  }

  async function createShareCollageBlob() {
    if (!selectedShareCollagePhotos.length) {
      throw new Error('Select at least one photo for the collage.');
    }
    await renderShareCollagePreview();
    if (shareCollagePreviewError) throw shareCollagePreviewError;
    return canvasToBlob(document.getElementById('share-collage-canvas'));
  }

  async function uploadShareCollage(base64) {
    let response;
    try {
      response = await fetch(API + '/email-campaign', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ mode: 'collage-upload', collageBase64: base64 })
      });
    } catch {
      throw new Error('The collage could not reach the server. Check your connection and try again.');
    }
    const data = await response.json();
    if (!response.ok || !data.success || !data.collageUrl) {
      throw new Error(data.error || 'The collage could not be uploaded.');
    }
    return data.collageUrl;
  }

  async function prepareShareCollage() {
    const includeCollage = document.getElementById('video-share-include-collage').checked;
    if (!includeCollage) return null;
    if (!selectedShareCollagePhotos.length) {
      throw new Error('Select at least one photo, or turn off the collage option.');
    }

    const recipientName = document.getElementById('video-share-name').value.trim();
    const signature = `${recipientName}|${selectedShareCollagePhotos.map(photo => photo.url).join('|')}`;
    if (cachedShareCollage && cachedShareCollage.signature === signature) return cachedShareCollage;

    const blob = await createShareCollageBlob();
    const base64 = await blobToBase64(blob);
    const url = await uploadShareCollage(base64);
    cachedShareCollage = { signature, url, base64, blob };
    return cachedShareCollage;
  }

  window.downloadShareCollage = async function () {
    const status = document.getElementById('video-share-status');
    try {
      const blob = await createShareCollageBlob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'baby-shower-personalized-collage.jpg';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      status.textContent = 'Collage downloaded.';
      status.style.color = '#2a7c4f';
    } catch (error) {
      status.textContent = error.message;
      status.style.color = '#991b1b';
    }
  };

  function resetPersonalizedShareForm() {
    document.getElementById('video-share-email').value = '';
    document.getElementById('video-share-name').value = '';
    document.getElementById('video-share-phone').value = '';
    document.getElementById('video-share-timestamp').value = '';
    document.getElementById('video-share-include-collage').checked = false;
    document.getElementById('video-share-collage-builder').hidden = true;
    window.clearShareCollage();
  }

  function validatePersonalizedShareDetails({ email, phone, videoTimestamp, requireEmail, requireContact }) {
    if (requireEmail && !email) throw new Error('Enter the recipient email address.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Enter a valid recipient email address.');
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phone && (phoneDigits.length < 7 || phoneDigits.length > 15)) {
      throw new Error('Enter the WhatsApp number with country code.');
    }
    if (requireContact && !email && !phoneDigits) {
      throw new Error('Enter an email address or WhatsApp number.');
    }
    if (videoTimestamp) {
      const match = videoTimestamp.match(/^(\d{1,2}):([0-5]\d)$/);
      if (!match || (Number(match[1]) * 60) + Number(match[2]) > 215) {
        throw new Error('Enter a video moment within 3:35, for example 1:42.');
      }
    }
  }

  function renderSavedShareCards(cards) {
    const grid = document.getElementById('saved-share-grid');
    const summary = document.getElementById('saved-share-summary');
    const sendAllButton = document.getElementById('saved-share-send-all');
    if (!grid || !summary || !sendAllButton) return;

    const pendingEmailCount = cards.filter(card => card.email && !card.emailSentAt).length;
    const whatsappCount = cards.filter(card => card.phone).length;
    summary.textContent = `${cards.length} saved · ${pendingEmailCount} pending email${pendingEmailCount === 1 ? '' : 's'} · ${whatsappCount} WhatsApp contact${whatsappCount === 1 ? '' : 's'}`;
    sendAllButton.disabled = pendingEmailCount === 0;
    sendAllButton.textContent = pendingEmailCount
      ? `Send All ${pendingEmailCount} Pending Email${pendingEmailCount === 1 ? '' : 's'}`
      : 'All Saved Emails Sent';

    grid.innerHTML = cards.map(card => `
      <article class="saved-share-card" data-share-card-id="${card.id}">
        ${card.collageUrl
          ? `<img src="${card.collageUrl}" alt="Personalized collage for ${escapeAdminHtml(card.name)}" loading="lazy" />`
          : '<div style="aspect-ratio:4/3;display:grid;place-items:center;background:#eadde1;color:var(--muted);font-size:0.75rem">No collage</div>'}
        <div class="saved-share-card__body">
          <h4>${escapeAdminHtml(card.name)}</h4>
          ${card.email ? `<p>${escapeAdminHtml(card.email)}</p>` : ''}
          ${card.phone ? `<p>WhatsApp: +${escapeAdminHtml(card.phone)}</p>` : ''}
          ${card.videoTimestamp ? `<p>Video moment: ${escapeAdminHtml(card.videoTimestamp)}</p>` : ''}
          <div class="saved-share-card__status">
            ${card.email
              ? `<span class="saved-share-card__badge${card.emailSentAt ? ' is-sent' : ''}">${card.emailSentAt ? 'Email sent' : 'Email pending'}</span>`
              : ''}
            ${card.phone
              ? `<span class="saved-share-card__badge${card.whatsappOpenedAt ? ' is-sent' : ''}">${card.whatsappOpenedAt ? 'WhatsApp opened' : 'WhatsApp ready'}</span>`
              : ''}
          </div>
          <div class="saved-share-card__actions">
            ${card.email && !card.emailSentAt
              ? `<button type="button" class="btn btn--dark" onclick="sendSavedShareCard('${card.id}')">Send Email</button>`
              : ''}
            ${card.phone
              ? `<button type="button" class="btn" style="background:#25d366;color:#fff;border-color:#25d366" onclick="openSavedShareCardWhatsApp('${card.id}')">Open WhatsApp</button>`
              : ''}
            <button type="button" class="btn btn--outline" onclick="deleteSavedShareCard('${card.id}')">Delete</button>
          </div>
        </div>
      </article>
    `).join('') || '<p style="color:var(--muted)">No personalized cards saved yet.</p>';
  }

  window.loadEmailCampaign = async function () {
    const status = document.getElementById('email-campaign-status');
    if (!status) return;
    status.textContent = 'Loading campaign details...';
    status.style.color = 'var(--muted)';

    try {
      const response = await fetch(API + '/email-campaign', { headers: adminHeaders() });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load the campaign.');

      currentEmailCampaign = data.campaign;
      document.getElementById('email-campaign-subject').textContent = data.campaign.subject;
      document.getElementById('email-total-count').textContent = data.campaign.totalRecipients;
      document.getElementById('email-sent-count').textContent = data.campaign.sentCount;
      document.getElementById('email-pending-count').textContent = data.campaign.pendingCount;
      document.getElementById('email-campaign-preview').srcdoc = data.campaign.previewHtml;
      renderSavedShareCards(data.campaign.shareCards || []);
      document.getElementById('email-recipient-list').innerHTML = data.campaign.recipients.map(recipient => `
        <span style="padding:0.45rem 0.7rem;border:1px solid ${recipient.sent ? '#86c79f' : 'var(--border)'};border-radius:999px;background:${recipient.sent ? '#edf9f1' : 'var(--ivory)'};font-size:0.72rem">
          ${recipient.sent ? '✓ ' : ''}${escapeAdminHtml(recipient.name)} · ${escapeAdminHtml(recipient.email)}
        </span>
      `).join('');

      const sendButton = document.getElementById('email-send-participants');
      sendButton.disabled = data.campaign.pendingCount === 0;
      sendButton.textContent = data.campaign.pendingCount
        ? `Send to ${data.campaign.pendingCount} Pending Participant${data.campaign.pendingCount === 1 ? '' : 's'}`
        : 'Campaign Complete';
      status.textContent = data.campaign.completedAt
        ? `Completed ${new Date(data.campaign.completedAt).toLocaleString()}`
        : `Campaign is ${data.campaign.status}.`;
    } catch (error) {
      status.textContent = error.message;
      status.style.color = '#991b1b';
    }
  };

  window.sendCampaignTest = async function () {
    const testEmail = document.getElementById('email-test-address').value.trim();
    const testName = document.getElementById('email-test-name').value.trim();
    const status = document.getElementById('email-send-status');
    if (!testEmail) {
      status.textContent = 'Enter a test email address.';
      status.style.color = '#991b1b';
      return;
    }

    status.textContent = 'Sending test email...';
    status.style.color = 'var(--muted)';
    try {
      const response = await fetch(API + '/email-campaign', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ mode: 'test', testEmail, testName })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Test email failed.');
      status.textContent = `Test email sent to ${testEmail}.`;
      status.style.color = '#2a7c4f';
    } catch (error) {
      status.textContent = error.message;
      status.style.color = '#991b1b';
    }
  };

  window.sendPrivateVideoLink = async function () {
    const email = document.getElementById('video-share-email').value.trim();
    const name = document.getElementById('video-share-name').value.trim();
    const phone = document.getElementById('video-share-phone').value.trim();
    const videoTimestamp = document.getElementById('video-share-timestamp').value.trim();
    const status = document.getElementById('video-share-status');
    const button = document.getElementById('video-share-send');

    button.disabled = true;
    status.textContent = 'Preparing the personalized invitation...';
    status.style.color = 'var(--muted)';

    try {
      validatePersonalizedShareDetails({ email, phone, videoTimestamp, requireEmail: true });
      const collage = await prepareShareCollage();
      status.textContent = 'Sending the Baby Shower invitation...';
      const response = await fetch(API + '/email-campaign', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          mode: 'share',
          email,
          name,
          phone,
          videoTimestamp,
          collageUrl: collage && collage.url,
          collageBase64: collage && collage.base64
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Baby Shower link could not be sent.');
      status.textContent = collage
        ? `Personalized collage, Baby Shower link, and login details sent to ${email}.`
        : `Baby Shower link and login details sent to ${email}.`;
      status.style.color = '#2a7c4f';
      resetPersonalizedShareForm();
    } catch (error) {
      status.textContent = error.message;
      status.style.color = '#991b1b';
    } finally {
      button.disabled = false;
    }
  };

  window.shareVideoOnWhatsApp = async function () {
    const name = document.getElementById('video-share-name').value.trim();
    const phone = document.getElementById('video-share-phone').value.trim();
    const videoTimestamp = document.getElementById('video-share-timestamp').value.trim();
    const status = document.getElementById('video-share-status');
    const button = document.getElementById('video-share-whatsapp');
    const whatsappWindow = window.open('about:blank', '_blank');

    if (!whatsappWindow) {
      status.textContent = 'Allow pop-ups for this page, then try WhatsApp again.';
      status.style.color = '#991b1b';
      return;
    }

    whatsappWindow.opener = null;
    whatsappWindow.document.body.textContent = 'Preparing WhatsApp...';
    button.disabled = true;
    status.textContent = 'Preparing the personalized WhatsApp invitation...';
    status.style.color = 'var(--muted)';

    try {
      validatePersonalizedShareDetails({ email: '', phone, videoTimestamp });
      const collage = await prepareShareCollage();
      const response = await fetch(API + '/email-campaign', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ mode: 'whatsapp', name, phone, videoTimestamp, collageUrl: collage && collage.url })
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.message) {
        throw new Error(data.error || 'WhatsApp invitation could not be prepared.');
      }
      const whatsappUrl = data.phone
        ? `https://wa.me/${data.phone}?text=${encodeURIComponent(data.message)}`
        : `https://wa.me/?text=${encodeURIComponent(data.message)}`;
      whatsappWindow.location.replace(whatsappUrl);
      status.textContent = collage
        ? 'WhatsApp opened with the personalized collage link and invitation ready to send.'
        : 'WhatsApp opened with the invitation ready to send.';
      status.style.color = '#2a7c4f';
    } catch (error) {
      whatsappWindow.close();
      status.textContent = error.message;
      status.style.color = '#991b1b';
    } finally {
      button.disabled = false;
    }
  };

  window.savePersonalizedShareCard = async function () {
    const name = document.getElementById('video-share-name').value.trim();
    const email = document.getElementById('video-share-email').value.trim();
    const phone = document.getElementById('video-share-phone').value.trim();
    const videoTimestamp = document.getElementById('video-share-timestamp').value.trim();
    const status = document.getElementById('video-share-status');
    const button = document.getElementById('video-share-save');

    if (!name) {
      status.textContent = 'Enter the recipient name before saving.';
      status.style.color = '#991b1b';
      return;
    }
    button.disabled = true;
    status.textContent = 'Preparing and saving the personalized card...';
    status.style.color = 'var(--muted)';
    try {
      validatePersonalizedShareDetails({ email, phone, videoTimestamp, requireContact: true });
      const collage = await prepareShareCollage();
      const response = await fetch(API + '/email-campaign', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          mode: 'save-share-card',
          name,
          email,
          phone,
          videoTimestamp,
          collageUrl: collage && collage.url
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'The personalized card could not be saved.');
      status.textContent = `Saved ${name}'s personalized card.`;
      status.style.color = '#2a7c4f';
      resetPersonalizedShareForm();
      await loadEmailCampaign();
      const savedCard = Array.from(document.querySelectorAll('[data-share-card-id]'))
        .find(element => element.dataset.shareCardId === data.card.id);
      if (savedCard) savedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      status.textContent = error.message;
      status.style.color = '#991b1b';
    } finally {
      button.disabled = false;
    }
  };

  window.sendSavedShareCard = async function (id) {
    const card = (currentEmailCampaign.shareCards || []).find(item => item.id === id);
    if (!card || !card.email) return;
    if (!confirm(`Send ${card.name}'s saved card to ${card.email}?`)) return;
    const status = document.getElementById('saved-share-status');
    status.textContent = `Sending ${card.name}'s email...`;
    status.style.color = 'var(--muted)';
    try {
      const response = await fetch(API + '/email-campaign', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ mode: 'send-share-card', id })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'The saved email could not be sent.');
      status.textContent = `Email sent to ${card.name}.`;
      status.style.color = '#2a7c4f';
      await loadEmailCampaign();
    } catch (error) {
      status.textContent = error.message;
      status.style.color = '#991b1b';
    }
  };

  window.openSavedShareCardWhatsApp = async function (id) {
    const card = (currentEmailCampaign.shareCards || []).find(item => item.id === id);
    if (!card) return;
    const whatsappWindow = window.open('about:blank', '_blank');
    const status = document.getElementById('saved-share-status');
    if (!whatsappWindow) {
      status.textContent = 'Allow pop-ups for this page, then try WhatsApp again.';
      status.style.color = '#991b1b';
      return;
    }
    whatsappWindow.opener = null;
    whatsappWindow.document.body.textContent = 'Preparing WhatsApp...';
    try {
      const response = await fetch(API + '/email-campaign', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ mode: 'whatsapp-card', id })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'The WhatsApp card could not be opened.');
      const whatsappUrl = data.phone
        ? `https://wa.me/${data.phone}?text=${encodeURIComponent(data.message)}`
        : `https://wa.me/?text=${encodeURIComponent(data.message)}`;
      whatsappWindow.location.replace(whatsappUrl);
      status.textContent = `WhatsApp opened for ${card.name}.`;
      status.style.color = '#2a7c4f';
      await loadEmailCampaign();
    } catch (error) {
      whatsappWindow.close();
      status.textContent = error.message;
      status.style.color = '#991b1b';
    }
  };

  window.deleteSavedShareCard = async function (id) {
    const card = (currentEmailCampaign.shareCards || []).find(item => item.id === id);
    if (!card || !confirm(`Delete ${card.name}'s saved card?`)) return;
    const status = document.getElementById('saved-share-status');
    try {
      const response = await fetch(API + '/email-campaign', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ mode: 'delete-share-card', id })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'The saved card could not be deleted.');
      status.textContent = `Deleted ${card.name}'s saved card.`;
      status.style.color = '#2a7c4f';
      await loadEmailCampaign();
    } catch (error) {
      status.textContent = error.message;
      status.style.color = '#991b1b';
    }
  };

  window.sendAllSavedShareCards = async function () {
    const pendingCards = (currentEmailCampaign.shareCards || []).filter(card => card.email && !card.emailSentAt);
    if (!pendingCards.length) return;
    const requiredConfirmation = `SEND ${pendingCards.length} SAVED EMAIL${pendingCards.length === 1 ? '' : 'S'}`;
    const confirmation = prompt(
      `This will send every pending personalized email and cannot be undone.\n\nType exactly:\n${requiredConfirmation}`
    );
    if (confirmation === null) return;
    const status = document.getElementById('saved-share-status');
    if (confirmation !== requiredConfirmation) {
      status.textContent = 'Confirmation did not match. No saved emails were sent.';
      status.style.color = '#991b1b';
      return;
    }

    const button = document.getElementById('saved-share-send-all');
    button.disabled = true;
    status.textContent = `Sending ${pendingCards.length} personalized emails...`;
    status.style.color = 'var(--muted)';
    try {
      const response = await fetch(API + '/email-campaign', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ mode: 'send-share-cards', confirmation })
      });
      const data = await response.json();
      if (!response.ok && response.status !== 207) throw new Error(data.error || 'Saved emails could not be sent.');
      status.textContent = data.failedCount
        ? `Sent ${data.sentCount}; ${data.failedCount} failed and remain pending.`
        : `Sent all ${data.sentCount} personalized emails.`;
      status.style.color = data.failedCount ? '#9a6718' : '#2a7c4f';
      await loadEmailCampaign();
    } catch (error) {
      status.textContent = error.message;
      status.style.color = '#991b1b';
      button.disabled = false;
    }
  };

  window.sendParticipantCampaign = async function () {
    const status = document.getElementById('email-send-status');
    const pendingCount = currentEmailCampaign && currentEmailCampaign.pendingCount;
    if (!pendingCount) return;

    const requiredConfirmation = `SEND TO ${pendingCount} PARTICIPANTS`;
    const confirmation = prompt(
      `This will email ${pendingCount} RSVP participant${pendingCount === 1 ? '' : 's'} and cannot be undone.\n\nType exactly:\n${requiredConfirmation}`
    );
    if (confirmation === null) return;
    if (confirmation !== requiredConfirmation) {
      status.textContent = 'Confirmation did not match. No emails were sent.';
      status.style.color = '#991b1b';
      return;
    }

    const button = document.getElementById('email-send-participants');
    button.disabled = true;
    status.textContent = `Sending to ${pendingCount} participants...`;
    status.style.color = 'var(--muted)';

    try {
      const response = await fetch(API + '/email-campaign', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ mode: 'send', confirmation })
      });
      const data = await response.json();
      if (!response.ok && response.status !== 207) throw new Error(data.error || 'Campaign send failed.');
      status.textContent = data.failedCount
        ? `Sent ${data.sentNow}; ${data.failedCount} failed and remain safe to retry.`
        : `Sent successfully to ${data.sentNow} participants.`;
      status.style.color = data.failedCount ? '#9a6718' : '#2a7c4f';
      await loadEmailCampaign();
    } catch (error) {
      button.disabled = false;
      status.textContent = error.message;
      status.style.color = '#991b1b';
    }
  };

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
            <button onclick='editItem(${JSON.stringify(item).replace(/'/g,"&#39;")},"${cat}")'>Edit</button>
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
    // Clear edit mode
    const editId = document.getElementById(cat + '-edit-id');
    if (editId) editId.value = '';
  };

  window.editItem = function (item, cat) {
    showForm(cat);
    // Populate form fields
    const fields = {
      timeline: ['title', 'date', 'icon', 'order', 'description', 'photoUrl', 'album'],
      travel: ['destination', 'date', 'icon', 'order', 'description', 'photoUrl', 'album'],
      baby: ['title', 'month', 'icon', 'order', 'description', 'photoUrl', 'album']
    };
    (fields[cat] || []).forEach(f => {
      const el = document.getElementById(cat + '-' + f);
      if (el) el.value = item[f] || '';
    });
    // Set edit ID so save knows to update
    const editId = document.getElementById(cat + '-edit-id');
    if (editId) editId.value = item.id;
  };

  window.saveItem = async function (e, cat) {
    e.preventDefault();
    const body = {};
    const fields = {
      timeline: ['title', 'date', 'icon', 'order', 'description', 'photoUrl', 'album'],
      travel: ['destination', 'date', 'icon', 'order', 'description', 'photoUrl', 'album'],
      baby: ['title', 'month', 'icon', 'order', 'description', 'photoUrl', 'album']
    };
    (fields[cat] || []).forEach(f => {
      const el = document.getElementById(cat + '-' + f);
      if (el && el.value.trim()) body[f] = f === 'order' ? parseInt(el.value) : el.value.trim();
    });

    const editId = document.getElementById(cat + '-edit-id');
    const isEdit = editId && editId.value;

    let res;
    if (isEdit) {
      // Update existing item
      body.id = editId.value;
      body.category = cat;
      res = await fetch(API + '/' + cat, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } else {
      // Create new item
      res = await fetch(API + '/' + cat, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }

    const data = await res.json();
    if (data.success) {
      showStatus(isEdit ? 'Item updated!' : 'Item saved!');
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
            <p>${ev.date || ''} — <a href="babyshower.html?id=${ev.id}" target="_blank">View public page →</a></p>
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
        headers: adminHeaders(),
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

  // Drag & drop support for hero photo panels (both placeholder and preview)
  ['left', 'right'].forEach(side => {
    const placeholder = document.getElementById('hero-' + side + '-placeholder');
    const preview = document.getElementById('hero-' + side + '-preview');
    [placeholder, preview].forEach(el => {
      if (!el) return;
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.style.borderColor = 'var(--teal)'; el.style.opacity = '0.7'; });
      el.addEventListener('dragleave', () => { el.style.borderColor = '#ccc'; el.style.opacity = '1'; });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.style.borderColor = '#ccc';
        el.style.opacity = '1';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) uploadHeroPhoto(side, file);
      });
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
  const collageToggle = document.getElementById('video-share-include-collage');
  const collageSearch = document.getElementById('share-collage-search');
  const recipientNameInput = document.getElementById('video-share-name');
  if (collageToggle) {
    collageToggle.addEventListener('change', () => {
      document.getElementById('video-share-collage-builder').hidden = !collageToggle.checked;
      invalidateShareCollage();
    });
  }
  if (collageSearch) {
    collageSearch.addEventListener('input', () => {
      visibleShareCollagePhotos = 72;
      renderShareCollagePhotoGrid();
    });
  }
  if (recipientNameInput) {
    recipientNameInput.addEventListener('input', () => {
      invalidateShareCollage();
      renderShareCollagePreview();
    });
  }
  renderShareCollagePhotoGrid();
  renderShareCollagePreview();
  loadEmailCampaign();
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

  // ─── Bulk Photo Manager ─────────────────────────────────
  let bulkPhotos = [];

  window.loadBlobPhotos = async function () {
    const grid = document.getElementById('bulk-photo-grid');
    const status = document.getElementById('bulk-status');
    grid.innerHTML = '<p style="color:var(--muted)">Loading photos from storage...</p>';
    try {
      const res = await fetch(API + '/blob-photos');
      const data = await res.json();
      if (!data.success) { grid.innerHTML = '<p style="color:#991b1b">Error: ' + (data.error || 'Failed') + '</p>'; return; }
      bulkPhotos = data.photos || [];
      const uncategorized = bulkPhotos.filter(p => !p.inGallery);
      const categorized = bulkPhotos.filter(p => p.inGallery);
      status.textContent = `${bulkPhotos.length} total blobs | ${uncategorized.length} uncategorized | ${categorized.length} already in gallery`;

      grid.innerHTML = bulkPhotos.map((p, i) => `
        <div class="bulk-photo-item ${p.inGallery ? 'in-gallery' : ''}" data-url="${p.url}" data-index="${i}" onclick="toggleBulkSelect(this)">
          <img src="${p.url}" alt="${p.name}" loading="lazy" style="width:100%;height:120px;object-fit:cover;border-radius:4px" />
          <div style="font-size:0.65rem;color:var(--muted);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0.25rem">${p.name.split('/').pop()}</div>
          ${p.inGallery ? '<div style="position:absolute;top:4px;right:4px;background:#22c55e;color:white;font-size:0.6rem;padding:2px 5px;border-radius:3px">✓ In Gallery</div>' : ''}
          <input type="checkbox" class="bulk-check" style="position:absolute;top:4px;left:4px;width:18px;height:18px" />
        </div>
      `).join('');
    } catch (e) {
      grid.innerHTML = '<p style="color:#991b1b">Error loading blob photos.</p>';
    }
  };

  window.toggleBulkSelect = function (el) {
    const cb = el.querySelector('.bulk-check');
    cb.checked = !cb.checked;
    el.classList.toggle('selected', cb.checked);
  };

  window.bulkSelectAll = function () {
    document.querySelectorAll('.bulk-photo-item').forEach(el => {
      el.querySelector('.bulk-check').checked = true;
      el.classList.add('selected');
    });
  };

  window.bulkDeselectAll = function () {
    document.querySelectorAll('.bulk-photo-item').forEach(el => {
      el.querySelector('.bulk-check').checked = false;
      el.classList.remove('selected');
    });
  };

  window.bulkAssignPhotos = async function () {
    const album = document.getElementById('bulk-album-custom').value.trim() || document.getElementById('bulk-album-select').value;
    if (!album) { alert('Please select or type an album name.'); return; }

    const selected = document.querySelectorAll('.bulk-photo-item .bulk-check:checked');
    if (selected.length === 0) { alert('Please select at least one photo.'); return; }

    const status = document.getElementById('bulk-status');
    status.textContent = `Assigning ${selected.length} photos to "${album}"...`;

    let success = 0;
    for (const cb of selected) {
      const item = cb.closest('.bulk-photo-item');
      const url = item.dataset.url;
      try {
        const res = await fetch(API + '/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ album, url, caption: album.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), order: success + 1 })
        });
        const data = await res.json();
        if (data.success) success++;
      } catch (e) { /* continue */ }
    }

    status.textContent = `✅ Assigned ${success}/${selected.length} photos to "${album}"`;
    showStatus(`${success} photos added to ${album}!`);
    loadPhotos();
    loadBlobPhotos();
  };

  // Auto-load blob photos when Photos tab is shown
  const photosTab = document.querySelector('[data-tab="photos"]');
  if (photosTab) {
    photosTab.addEventListener('click', () => { setTimeout(loadBlobPhotos, 300); });
  }
})();
