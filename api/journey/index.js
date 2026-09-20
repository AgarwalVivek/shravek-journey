const { CosmosClient } = require("@azure/cosmos");
const crypto = require("crypto");
const { authenticator } = require("otplib");
const QRCode = require("qrcode");
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require("@azure/storage-blob");
const { EmailClient } = require("@azure/communication-email");

let cosmosContainer;
const BABY_SHOWER_CAMPAIGN_ID = "email-campaign_babyshower-memories-20260916";
const BABY_SHOWER_SHARE_CARD_CATEGORY = "babyshower-share-card";
const BABY_SHOWER_EVENT_ID = "event_1778962966548_06mo";
const BABY_SHOWER_MEMORIES_URL = "https://www.shravek.com/babyshower-memories.html";
const BABY_SHOWER_ACCESS_URL = "https://www.shravek.com/access";
const BABY_SHOWER_POSTER_URL = "https://shravekjourneyphotos.blob.core.windows.net/photos/baby-shower-film/before-we-met-you-poster.webp?v=20260915";

function getContainer() {
  const connectionString = process.env.COSMOS_CONNECTION_STRING;
  const databaseId = process.env.COSMOS_DATABASE_ID || "shravek-db";
  const containerId = process.env.COSMOS_CONTAINER_ID || "journey-data";

  if (!connectionString) {
    throw new Error("Missing COSMOS_CONNECTION_STRING environment variable.");
  }

  if (!cosmosContainer) {
    const client = new CosmosClient(connectionString);
    cosmosContainer = client.database(databaseId).container(containerId);
  }
  return cosmosContainer;
}

const SITE_ACCESS_COOKIE = "shravek_family_access";
const BABY_SHOWER_ACCESS_COOKIE = "shravek_babyshower_access";
const SITE_ACCESS_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const BABY_SHOWER_INVITE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function getSiteAccessConfig() {
  const username = process.env.SITE_ACCESS_USERNAME;
  const password = process.env.SITE_ACCESS_PASSWORD;
  const secret = process.env.SITE_ACCESS_SECRET;
  if (!username || !password || !secret) {
    throw new Error("Site access credentials are not configured.");
  }
  return { username, password, secret };
}

function getBabyShowerAccessConfig() {
  const username = process.env.BABY_SHOWER_ACCESS_USERNAME;
  const password = process.env.BABY_SHOWER_ACCESS_PASSWORD;
  const secret = process.env.SITE_ACCESS_SECRET;
  if (!username || !password || !secret) {
    throw new Error("Baby Shower access credentials are not configured.");
  }
  return { username, password, secret };
}

function isBabyShowerPage(page) {
  const path = String(page || "").split(/[?#]/)[0].toLowerCase();
  return path === "/babyshower.html" ||
    path === "/babyshower" ||
    path === "/babyshower-memories.html" ||
    path === "/babyshower-memories";
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getCookies(req) {
  const cookieHeader = (req.headers && (req.headers.cookie || req.headers.Cookie)) || "";
  return cookieHeader.split(";").reduce((cookies, part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return cookies;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies[name] = value;
    return cookies;
  }, {});
}

function createSiteAccessToken(username, secret, scope, maxAgeSeconds = SITE_ACCESS_MAX_AGE_SECONDS) {
  const payload = Buffer.from(JSON.stringify({
    username,
    scope,
    expiresAt: Date.now() + (maxAgeSeconds * 1000)
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifySiteAccessToken(token, secret, scope, expectedUsername) {
  if (!token) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;

  const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (!safeEqual(signature, expectedSignature)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.scope === scope &&
      data.expiresAt > Date.now() &&
      (!expectedUsername || safeEqual(data.username, expectedUsername));
  } catch {
    return false;
  }
}

function siteAccessCookie(name, token, maxAge = SITE_ACCESS_MAX_AGE_SECONDS) {
  return `${name}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function buildBabyShowerAccessLink(credentials, videoTimestamp) {
  const invite = createSiteAccessToken(
    credentials.username,
    credentials.secret,
    "babyshower-invite",
    BABY_SHOWER_INVITE_MAX_AGE_SECONDS
  );
  const videoMomentUrl = buildVideoMomentUrl(videoTimestamp);
  const momentUrl = videoMomentUrl ? new URL(videoMomentUrl) : null;
  const returnPath = momentUrl
    ? momentUrl.pathname + momentUrl.search + momentUrl.hash
    : "/babyshower-memories.html#film";
  const returnTo = encodeURIComponent(returnPath);
  return `${BABY_SHOWER_ACCESS_URL}?return=${returnTo}&invite=${encodeURIComponent(invite)}`;
}

// Email helper using Azure Communication Services
async function sendEmail({ to, subject, htmlBody, plainText, attachments }) {
  const connectionString = process.env.ACS_CONNECTION_STRING;
  const senderAddress = process.env.ACS_SENDER_EMAIL;
  if (!connectionString || !senderAddress) {
    throw new Error("Email is not configured.");
  }

  const emailClient = new EmailClient(connectionString);
  const content = { subject, html: htmlBody };
  if (plainText) content.plainText = plainText;
  const message = {
    senderAddress,
    content,
    recipients: { to: Array.isArray(to) ? to.map(e => ({ address: e })) : [{ address: to }] }
  };
  if (attachments && attachments.length) message.attachments = attachments;
  const poller = await emailClient.beginSend(message);
  const result = await poller.pollUntilDone();
  if (result.status !== "Succeeded") {
    throw new Error(`Azure email delivery failed with status ${result.status || "Unknown"}.`);
  }
  return result;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function maskEmail(value) {
  const [local, domain] = String(value || "").split("@");
  if (!local || !domain) return "";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function validateCollageUrl(value) {
  if (!value) return "";
  const url = new URL(String(value));
  const validHost = url.hostname.toLowerCase() === "shravekjourneyphotos.blob.core.windows.net";
  const validPath = url.pathname.startsWith("/photos/share-collages/");
  if (url.protocol !== "https:" || !validHost || !validPath) {
    throw new Error("The collage URL is invalid.");
  }
  return url.toString();
}

function buildCollageAttachment(value) {
  if (!value) return null;
  const base64 = String(value).replace(/^data:image\/jpeg;base64,/, "");
  if (base64.length > 8 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("The collage attachment is invalid or too large.");
  }
  return {
    name: "baby-shower-personalized-collage.jpg",
    contentType: "image/jpeg",
    contentInBase64: base64
  };
}

async function storeShareCollage(value) {
  const attachment = buildCollageAttachment(value);
  if (!attachment) throw new Error("The collage image is required.");

  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("Storage is not configured.");

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient("photos");
  const blobName = `share-collages/baby-shower-collage-${crypto.randomUUID()}.jpg`;
  const blobClient = containerClient.getBlockBlobClient(blobName);
  await blobClient.uploadData(Buffer.from(attachment.contentInBase64, "base64"), {
    blobHTTPHeaders: {
      blobContentType: attachment.contentType,
      blobCacheControl: "public, max-age=31536000, immutable"
    }
  });
  return `https://${blobServiceClient.accountName}.blob.core.windows.net/photos/${blobName}`;
}

function buildVideoMomentUrl(value) {
  const timestamp = String(value || "").trim();
  if (!timestamp) return "";
  const match = timestamp.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) throw new Error("Enter the video moment as minutes:seconds, for example 1:42.");
  const seconds = (Number(match[1]) * 60) + Number(match[2]);
  if (seconds > 215) throw new Error("The video moment must be within the 3:35 film.");
  return `${BABY_SHOWER_MEMORIES_URL}?start=${seconds}#film`;
}

function normalizeWhatsAppPhone(value) {
  const phone = String(value || "").replace(/\D/g, "");
  if (!phone) return "";
  if (phone.length < 7 || phone.length > 15) {
    throw new Error("Enter the WhatsApp number with country code.");
  }
  return phone;
}

async function downloadShareCollageAttachment(collageUrlValue) {
  const collageUrl = validateCollageUrl(collageUrlValue);
  if (!collageUrl) return null;

  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("Storage is not configured.");

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const url = new URL(collageUrl);
  const blobName = decodeURIComponent(url.pathname.replace(/^\/photos\//, ""));
  const content = await blobServiceClient
    .getContainerClient("photos")
    .getBlockBlobClient(blobName)
    .downloadToBuffer();
  return buildCollageAttachment(content.toString("base64"));
}

async function requireAdmin(context, req) {
  const authorization = (req.headers && req.headers.authorization) || "";
  const token = (req.headers && req.headers["x-admin-token"]) ||
    (authorization.startsWith("Bearer ") ? authorization.slice(7) : "");

  if (!token) {
    context.res = {
      status: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Admin authorization is required." })
    };
    return null;
  }

  const container = getContainer();
  const { resources } = await container.items
    .query({
      query: "SELECT c.id, c.username FROM c WHERE c.category = 'admin' AND ARRAY_CONTAINS(c.activeTokens, @token)",
      parameters: [{ name: "@token", value: token }]
    })
    .fetchAll();

  if (!resources.length) {
    context.res = {
      status: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "The admin session is invalid or expired." })
    };
    return null;
  }

  return resources[0];
}

function buildBabyShowerAnnouncement(recipientName, credentials, collage = {}) {
  const safeName = escapeHtml(recipientName || "Friend");
  const greetingName = safeName.split(/\s+/)[0] || "Friend";
  const videoTimestamp = String(collage.videoTimestamp || "").trim();
  const accessUrl = buildBabyShowerAccessLink(credentials, videoTimestamp);
  const safeAccessUrl = escapeHtml(accessUrl);
  const safeUsername = escapeHtml(credentials.username);
  const safePassword = escapeHtml(credentials.password);
  const collageUrl = validateCollageUrl(collage.url);
  const videoMomentUrl = videoTimestamp ? accessUrl : "";
  const safeCollageUrl = escapeHtml(collageUrl);
  const safeVideoMomentUrl = escapeHtml(videoMomentUrl);
  const collageAttachment = buildCollageAttachment(collage.contentInBase64);
  const subject = "Our Baby Shower Film & Photos Are Here 🎀";
  const plainText = `Hi ${recipientName || "Friend"},

Our Baby Shower film and complete photo album are ready.

${collageUrl ? `We made a small collage featuring memories you were part of:\n${collageUrl}\n\n` : ""}${videoMomentUrl ? `Open the website directly at your moment in the embedded film:\n${videoMomentUrl}\n\n` : ""}Watch "Before We Met You" inside our website and explore the Tiny Toes & Pretty Bows memories:
${accessUrl}

Username: ${credentials.username}
Password: ${credentials.password}

Please stay until the end—you may spot yourself or someone you know in the film.

Thank you for filling that beautiful day with your love and blessings.

With love,
Vivek & Shraddha`;
  const htmlBody = `
    <!doctype html>
    <html>
      <body style="margin:0;padding:0;background:#f8f1f3;color:#2a1d23;font-family:Arial,sans-serif">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f1f3;padding:24px 12px">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;overflow:hidden;background:#ffffff;border-radius:14px;box-shadow:0 12px 40px rgba(54,31,42,.12)">
                <tr>
                  <td style="height:310px;background:#23171d url('${BABY_SHOWER_POSTER_URL}') center/cover no-repeat;text-align:center;vertical-align:middle">
                    <a href="${safeAccessUrl}" style="display:inline-block;width:72px;height:72px;border:2px solid #fff;border-radius:50%;color:#fff;background:rgba(27,20,24,.55);font-size:28px;line-height:72px;text-decoration:none;padding-left:4px">▶</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:42px 42px 38px;text-align:center">
                    <p style="margin:0 0 12px;color:#b96580;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">Tiny Toes &amp; Pretty Bows</p>
                    <h1 style="margin:0;color:#2a1d23;font-family:Georgia,serif;font-size:42px;font-weight:normal;line-height:1.05">Before We Met You</h1>
                    <p style="margin:10px 0 24px;color:#8d6876;font-family:Georgia,serif;font-size:19px;font-style:italic">Our Baby Shower film &amp; complete album</p>
                    <p style="margin:0 0 18px;color:#4d3c43;font-size:16px;line-height:1.7">Hi ${greetingName},</p>
                    <p style="margin:0 0 28px;color:#67555d;font-size:15px;line-height:1.75">The film and photographs from our celebration are ready. Thank you for filling that beautiful day with laughter, blessings, and so much love for our little one.</p>
                    ${safeCollageUrl ? `
                    <a href="${safeCollageUrl}" style="display:block;margin:0 auto 28px;text-decoration:none">
                      <img src="${safeCollageUrl}" width="536" alt="A personalized collage of Baby Shower memories" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:10px">
                    </a>` : ""}
                    ${safeVideoMomentUrl ? `
                    <a href="${safeVideoMomentUrl}" style="display:inline-block;margin:0 0 14px;padding:12px 20px;border:1px solid #a95773;border-radius:999px;color:#a95773;font-size:12px;font-weight:bold;letter-spacing:1px;text-decoration:none;text-transform:uppercase">Jump to Your Moment in the Film</a><br>` : ""}
                    <a href="${safeAccessUrl}" style="display:inline-block;padding:15px 26px;border-radius:999px;color:#fff;background:#a95773;font-size:12px;font-weight:bold;letter-spacing:1.4px;text-decoration:none;text-transform:uppercase">Watch the Film &amp; Explore Memories</a>
                    <div style="margin:22px auto 0;padding:16px;max-width:360px;border-radius:10px;background:#f8f1f3;color:#67555d;font-size:14px;line-height:1.7">
                      <strong>Username:</strong> ${safeUsername}<br>
                      <strong>Password:</strong> ${safePassword}
                    </div>
                    <p style="margin:18px 0 0;color:#8d6876;font-size:13px;line-height:1.6">Please stay until the end—you may spot yourself or someone you know in the film.</p>
                    <p style="margin:30px 0 0;color:#a38c95;font-family:Georgia,serif;font-size:16px;font-style:italic;line-height:1.6">With love,<br><strong style="color:#8f4c63">Vivek &amp; Shraddha</strong></p>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;color:#a8959d;font-size:11px">You are receiving this because you RSVP'd to our Baby Shower.</p>
            </td>
          </tr>
        </table>
      </body>
    </html>`;

  return {
    subject,
    plainText,
    htmlBody,
    attachments: collageAttachment ? [collageAttachment] : undefined
  };
}

function buildBabyShowerWhatsAppMessage(recipientName, credentials, collageUrlValue, videoTimestamp) {
  const name = String(recipientName || "").trim();
  const greeting = name ? `Hi ${name.split(/\s+/)[0]}!` : "Hi!";
  const collageUrl = validateCollageUrl(collageUrlValue);
  const normalizedTimestamp = String(videoTimestamp || "").trim();
  const accessUrl = buildBabyShowerAccessLink(credentials, normalizedTimestamp);
  return `${greeting}

${collageUrl ? `We made a little collage with memories you were part of:\n${collageUrl}\n\n` : ""}${normalizedTimestamp ? "This opens our website directly at your moment in the film:\n" : "Our Baby Shower film and complete photo album are ready on our website:\n"}${accessUrl}

The link signs you in automatically. If needed, use:
Username: ${credentials.username}
Password: ${credentials.password}

Please stay until the end—you may spot yourself or someone you know in the film.

With love,
Vivek & Shraddha`;
}

async function getBabyShowerEmailRecipients() {
  const container = getContainer();
  const { resources } = await container.items
    .query({
      query: "SELECT c.name, c.email FROM c WHERE c.category = 'rsvp' AND IS_DEFINED(c.email) AND (c.eventId = @eventId OR c.eventId = '' OR NOT IS_DEFINED(c.eventId))",
      parameters: [{ name: "@eventId", value: BABY_SHOWER_EVENT_ID }]
    })
    .fetchAll();
  const unique = new Map();

  for (const rsvp of resources) {
    const email = String(rsvp.email || "").trim().toLowerCase();
    if (!isValidEmail(email) || unique.has(email)) continue;
    unique.set(email, { email, name: String(rsvp.name || "Friend").trim() || "Friend" });
  }

  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function getCampaignRecord(container) {
  try {
    const { resource } = await container.item(BABY_SHOWER_CAMPAIGN_ID, "email-campaign").read();
    return resource || null;
  } catch (error) {
    if (error.code === 404 || error.statusCode === 404) return null;
    throw error;
  }
}

async function getBabyShowerShareCards(container) {
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.category = @category",
      parameters: [{ name: "@category", value: BABY_SHOWER_SHARE_CARD_CATEGORY }]
    })
    .fetchAll();
  return resources.sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
}

async function sendSavedShareCardEmail(container, card, credentials) {
  if (!card.email || !isValidEmail(card.email)) {
    throw new Error("This saved card does not have a valid email address.");
  }
  const collageAttachment = await downloadShareCollageAttachment(card.collageUrl);
  const message = buildBabyShowerAnnouncement(card.name, credentials, {
    url: card.collageUrl,
    contentInBase64: collageAttachment && collageAttachment.contentInBase64,
    videoTimestamp: card.videoTimestamp
  });
  const result = await sendEmail({ to: card.email, ...message });
  card.emailSentAt = new Date().toISOString();
  card.emailStatus = result.status;
  await container.item(card.id, BABY_SHOWER_SHARE_CARD_CATEGORY).replace(card);
  return { id: card.id, email: card.email, status: result.status };
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function sendRsvpEmails(rsvp) {
  const hostEmail = process.env.HOST_EMAIL;
  const guestName = rsvp.name || "Guest";
  const guests = rsvp.guests || 1;

  // Email to guest
  await sendEmail({
    to: rsvp.email,
    subject: "🎉 You're RSVP'd! — Shravek Journey",
    htmlBody: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem">
        <h2 style="color:#B45C6E">You're confirmed, ${guestName}! 🎉</h2>
        <p>Thank you for RSVPing to our baby shower. We're so excited to celebrate with you!</p>
        <p><strong>Guests:</strong> ${guests}</p>
        ${rsvp.message ? `<p><strong>Your message:</strong> ${rsvp.message}</p>` : ''}
        <p style="margin-top:1.5rem;color:#666">If you need to update your RSVP, visit the event page and use the "Already RSVP'd?" lookup.</p>
        <p style="color:#B45C6E">With love,<br>Vivek & Shraddha 💛</p>
      </div>`
  });

  // Email to host
  if (hostEmail) {
    await sendEmail({
      to: hostEmail,
      subject: `📋 New RSVP: ${guestName} (${guests} guest${guests > 1 ? 's' : ''})`,
      htmlBody: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:2rem">
          <h2>New RSVP Received!</h2>
          <p><strong>Name:</strong> ${guestName}</p>
          <p><strong>Email:</strong> ${rsvp.email}</p>
          <p><strong>Guests:</strong> ${guests}</p>
          ${rsvp.message ? `<p><strong>Message:</strong> ${rsvp.message}</p>` : ''}
          <p style="color:#666;margin-top:1rem">Received at: ${new Date().toLocaleString()}</p>
        </div>`
    });
  }
}

module.exports = async function (context, req) {
  const action = (context.bindingData.action || "").toLowerCase();

  try {
    switch (action) {
      case "photos":
        if (req.method === "GET") return await handleGetPhotos(context, req);
        if (req.method === "POST") return await handleAddPhoto(context, req);
        if (req.method === "DELETE") return await handleDeletePhoto(context, req);
        break;

      case "timeline":
        if (req.method === "GET") return await handleGetByCategory(context, "timeline");
        if (req.method === "POST") return await handleAddItem(context, req, "timeline");
        if (req.method === "PUT") return await handleUpdateItem(context, req);
        if (req.method === "DELETE") return await handleDeleteItem(context, req);
        break;

      case "travel":
        if (req.method === "GET") return await handleGetByCategory(context, "travel");
        if (req.method === "POST") return await handleAddItem(context, req, "travel");
        if (req.method === "DELETE") return await handleDeleteItem(context, req);
        break;

      case "baby":
        if (req.method === "GET") return await handleGetByCategory(context, "baby");
        if (req.method === "POST") return await handleAddItem(context, req, "baby");
        if (req.method === "DELETE") return await handleDeleteItem(context, req);
        break;

      case "login":
        if (req.method === "POST") return await handleLogin(context, req);
        break;

      case "verify":
        if (req.method === "POST") return await handleVerify(context, req);
        break;

      case "site-login":
        if (req.method === "POST") return await handleSiteLogin(context, req);
        break;

      case "site-invite-login":
        if (req.method === "POST") return await handleSiteInviteLogin(context, req);
        break;

      case "site-auth":
        if (req.method === "GET") return await handleSiteAuth(context, req);
        break;

      case "site-share-info":
        if (req.method === "GET") return await handleSiteShareInfo(context, req);
        break;

      case "site-logout":
        if (req.method === "POST") return await handleSiteLogout(context);
        break;

      case "events":
        if (req.method === "GET") return await handleGetEvents(context, req);
        if (req.method === "POST") return await handleCreateEvent(context, req);
        if (req.method === "PUT") return await handleUpdateEvent(context, req);
        if (req.method === "DELETE") return await handleDeleteEvent(context, req);
        break;

      case "rsvp":
        if (req.method === "GET") return await handleGetRsvps(context, req);
        if (req.method === "POST") return await handleCreateRsvp(context, req);
        if (req.method === "PUT") return await handleUpdateRsvp(context, req);
        if (req.method === "DELETE") return await handleCancelRsvp(context, req);
        break;

      case "rsvp-lookup":
        if (req.method === "GET") return await handleRsvpLookup(context, req);
        break;

      case "email-campaign":
        if (req.method === "GET" || req.method === "POST") return await handleEmailCampaign(context, req);
        break;

      case "registry":
        if (req.method === "GET") return await handleGetRegistry(context, req);
        if (req.method === "POST") return await handleCreateRegistryItem(context, req);
        if (req.method === "PUT") return await handleClaimRegistryItem(context, req);
        if (req.method === "DELETE") return await handleDeleteRegistryItem(context, req);
        break;

      case "registry-update":
        if (req.method === "PUT") return await handleUpdateRegistryItem(context, req);
        break;

      case "registry-unclaim":
        if (req.method === "PUT") return await handleUnclaimRegistryItem(context, req);
        break;

      case "my-claims":
        if (req.method === "GET") return await handleMyClaims(context, req);
        break;

      case "analyze-photo":
        if (req.method === "POST") return await handleAnalyzePhoto(context, req);
        break;

      case "scrape-amazon":
        if (req.method === "POST") return await handleScrapeAmazon(context, req);
        break;

      case "settings":
        if (req.method === "GET") return await handleGetSettings(context, req);
        if (req.method === "PUT") return await handleUpdateSettings(context, req);
        break;

      case "change-password":
        if (req.method === "PUT") return await handleChangePassword(context, req);
        break;

      case "setup-2fa":
        if (req.method === "POST") return await handleSetup2FA(context, req);
        break;

      case "verify-2fa":
        if (req.method === "POST") return await handleVerify2FA(context, req);
        break;

      case "2fa-status":
        if (req.method === "GET") return await handleGet2FAStatus(context, req);
        break;

      case "upload-url":
        if (req.method === "POST") return await handleGetUploadUrl(context, req);
        break;

      case "blob-photos":
        if (req.method === "GET") return await handleListBlobPhotos(context, req);
        break;

      case "download":
        if (req.method === "GET") return await handleDownload(context, req);
        break;

      case "all":
        return await handleGetAll(context);

      default:
        context.res = {
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ success: false, error: "Unknown action: " + action })
        };
    }
  } catch (error) {
    context.log.error("API error:", error.message, error.stack);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};

async function handleGetAll(context) {
  const container = getContainer();

  const { resources } = await container.items
    .query("SELECT * FROM c", { enableCrossPartitionQuery: true })
    .fetchAll();

  const sorted = resources.sort((a, b) => (a.order || 0) - (b.order || 0));

  const grouped = {
    timeline: sorted.filter(r => r.category === "timeline"),
    travel: sorted.filter(r => r.category === "travel"),
    baby: sorted.filter(r => r.category === "baby"),
    photos: sorted.filter(r => r.category === "photo")
  };

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, data: grouped })
  };
}

async function handleGetPhotos(context, req) {
  const container = getContainer();
  const album = req.query && req.query.album;

  let query = "SELECT * FROM c WHERE c.category = 'photo'";
  const params = [];

  if (album) {
    query = "SELECT * FROM c WHERE c.category = 'photo' AND c.album = @album";
    params.push({ name: "@album", value: album });
  }

  const { resources } = await container.items
    .query({ query, parameters: params })
    .fetchAll();

  const sorted = resources.sort((a, b) => (a.order || 0) - (b.order || 0));

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, photos: sorted })
  };
}

async function handleAddPhoto(context, req) {
  const body = req.body || {};

  if (!body.url) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Photo URL is required." })
    };
    return;
  }

  const photo = {
    id: "photo_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    category: "photo",
    album: (body.album || "general").trim(),
    url: body.url.trim(),
    caption: (body.caption || "").trim(),
    order: body.order || 0,
    createdAt: new Date().toISOString()
  };

  const container = getContainer();
  await container.items.create(photo);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, photo })
  };
}

async function handleDeletePhoto(context, req) {
  const id = req.query && req.query.id;
  if (!id) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Photo ID is required." })
    };
    return;
  }

  const container = getContainer();
  await container.item(id, "photo").delete();

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, message: "Photo deleted." })
  };
}

async function handleGetByCategory(context, category) {
  const container = getContainer();

  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.category = @cat",
      parameters: [{ name: "@cat", value: category }]
    })
    .fetchAll();

  const sorted = resources.sort((a, b) => (a.order || 0) - (b.order || 0));

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, items: sorted })
  };
}

async function handleAddItem(context, req, category) {
  const body = req.body || {};

  const item = {
    id: category + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    category,
    ...body,
    createdAt: new Date().toISOString()
  };

  item.category = category;

  const container = getContainer();
  await container.items.create(item);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, item })
  };
}

async function handleDeleteItem(context, req) {
  const id = req.query && req.query.id;
  const category = req.query && req.query.category;

  if (!id || !category) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "ID and category are required." })
    };
    return;
  }

  const container = getContainer();
  await container.item(id, category).delete();

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, message: "Item deleted." })
  };
}

// --- Update Item (PUT) ---

async function handleUpdateItem(context, req) {
  const body = req.body || {};
  const { id, category } = body;

  if (!id || !category) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "ID and category are required." })
    };
    return;
  }

  const container = getContainer();
  const { resource: existing } = await container.item(id, category).read();
  if (!existing) {
    context.res = {
      status: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Item not found." })
    };
    return;
  }

  // Merge fields from body into existing (skip id and category)
  const updated = { ...existing };
  for (const key of Object.keys(body)) {
    if (key !== "id" && key !== "_rid" && key !== "_self" && key !== "_etag" && key !== "_attachments" && key !== "_ts") {
      updated[key] = body[key];
    }
  }

  const { resource: result } = await container.item(id, category).replace(updated);
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, item: result })
  };
}

// --- Login & Verify ---

async function handleLogin(context, req) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Username and password are required." })
    };
    return;
  }

  const container = getContainer();
  const passwordHash = crypto.createHash("sha256").update(password).digest("hex");

  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.category = 'admin' AND c.username = @username AND c.passwordHash = @hash",
      parameters: [
        { name: "@username", value: username },
        { name: "@hash", value: passwordHash }
      ]
    })
    .fetchAll();

  if (resources.length === 0) {
    context.res = {
      status: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Invalid credentials." })
    };
    return;
  }

  const user = resources[0];
  const token = crypto.randomBytes(32).toString("hex");

  if (!Array.isArray(user.activeTokens)) {
    user.activeTokens = [];
  }
  user.activeTokens.push(token);

  await container.item(user.id, "admin").replace(user);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, token })
  };
}

async function handleVerify(context, req) {
  const { token } = req.body || {};
  if (!token) {
    context.res = {
      status: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Token is required." })
    };
    return;
  }

  const container = getContainer();
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.category = 'admin' AND ARRAY_CONTAINS(c.activeTokens, @token)",
      parameters: [{ name: "@token", value: token }]
    })
    .fetchAll();

  if (resources.length === 0) {
    context.res = {
      status: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Invalid token." })
    };
    return;
  }

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, username: resources[0].username })
  };
}

async function handleSiteLogin(context, req) {
  const { username, password, page } = req.body || {};
  const babyShower = isBabyShowerPage(page);
  const config = babyShower ? getBabyShowerAccessConfig() : getSiteAccessConfig();
  const normalizedUsername = String(username || "").trim().toLowerCase();
  const normalizedPassword = String(password || "").trim();
  const authenticated = safeEqual(normalizedUsername, config.username.trim().toLowerCase()) &&
    safeEqual(normalizedPassword, config.password.trim());

  if (!authenticated) {
    context.res = {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ success: false, error: "Invalid login ID or password." })
    };
    return;
  }

  const scope = babyShower ? "babyshower" : "family";
  const cookieName = babyShower ? BABY_SHOWER_ACCESS_COOKIE : SITE_ACCESS_COOKIE;
  const token = createSiteAccessToken(config.username, config.secret, scope);
  context.res = {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": siteAccessCookie(cookieName, token)
    },
    body: JSON.stringify({ success: true })
  };
}

async function handleSiteInviteLogin(context, req) {
  const { invite, page } = req.body || {};
  if (!isBabyShowerPage(page)) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ success: false, error: "This invitation link is only valid for the Baby Shower pages." })
    };
    return;
  }

  const config = getBabyShowerAccessConfig();
  if (!verifySiteAccessToken(invite, config.secret, "babyshower-invite", config.username)) {
    context.res = {
      status: 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ success: false, error: "This invitation link is invalid or has expired." })
    };
    return;
  }

  const sessionToken = createSiteAccessToken(config.username, config.secret, "babyshower");
  context.res = {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Set-Cookie": siteAccessCookie(BABY_SHOWER_ACCESS_COOKIE, sessionToken)
    },
    body: JSON.stringify({ success: true })
  };
}

async function handleSiteAuth(context, req) {
  const cookies = getCookies(req);
  const page = String((req.query && req.query.page) || "");
  const babyShower = isBabyShowerPage(page);
  const config = babyShower ? getBabyShowerAccessConfig() : getSiteAccessConfig();
  const cookieName = babyShower ? BABY_SHOWER_ACCESS_COOKIE : SITE_ACCESS_COOKIE;
  const scope = babyShower ? "babyshower" : "family";
  const authenticated = verifySiteAccessToken(cookies[cookieName], config.secret, scope);

  context.res = {
    status: authenticated ? 200 : 401,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify({ success: authenticated, authenticated })
  };
}

async function handleSiteShareInfo(context, req) {
  const config = getBabyShowerAccessConfig();
  const token = getCookies(req)[BABY_SHOWER_ACCESS_COOKIE];
  if (!verifySiteAccessToken(token, config.secret, "babyshower")) {
    context.res = {
      status: 401,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ success: false, error: "Baby Shower authentication required." })
    };
    return;
  }
  context.res = {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({
      success: true,
      title: "Before We Met You — Baby Shower Memories",
      text: `Watch our Baby Shower film and complete photo album.\n\nUsername: ${config.username}\nPassword: ${config.password}\n\nThis is a high-quality video, so it may take a little time to render and load. Please stay until the end—you may spot yourself or someone you know in the film.`,
      url: BABY_SHOWER_MEMORIES_URL
    })
  };
}

async function handleSiteLogout(context) {
  context.res = {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": siteAccessCookie(SITE_ACCESS_COOKIE, "", 0)
    },
    body: JSON.stringify({ success: true })
  };
}

// --- Events ---

async function handleGetEvents(context, req) {
  const container = getContainer();
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.category = 'event'",
      parameters: []
    })
    .fetchAll();

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, events: resources })
  };
}

async function handleCreateEvent(context, req) {
  const body = req.body || {};
  const event = {
    id: "event_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    category: "event",
    name: body.name || body.title,
    date: body.date,
    description: body.description,
    type: body.type,
    ...body,
    category: "event",
    createdAt: new Date().toISOString()
  };

  const container = getContainer();
  await container.items.create(event);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, event })
  };
}

async function handleUpdateEvent(context, req) {
  const body = req.body || {};
  if (!body.id) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Event ID is required." }) };
    return;
  }
  const container = getContainer();
  const { resource: existing } = await container.item(body.id, "event").read();
  if (!existing) {
    context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Event not found." }) };
    return;
  }
  const updated = { ...existing };
  if (body.name) updated.name = body.name;
  if (body.date) updated.date = body.date;
  if (body.description !== undefined) updated.description = body.description;
  if (body.type) updated.type = body.type;
  updated.updatedAt = new Date().toISOString();

  await container.item(body.id, "event").replace(updated);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: true, event: updated }) };
}

async function handleDeleteEvent(context, req) {
  const id = req.query && req.query.id;
  if (!id) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Event ID is required." })
    };
    return;
  }

  const container = getContainer();
  await container.item(id, "event").delete();

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, message: "Event deleted." })
  };
}

// --- RSVP ---

async function handleGetRsvps(context, req) {
  const eventId = req.query && req.query.eventId;
  const container = getContainer();

  let query, params;
  if (eventId) {
    query = "SELECT * FROM c WHERE c.category = 'rsvp' AND c.eventId = @eventId";
    params = [{ name: "@eventId", value: eventId }];
  } else {
    query = "SELECT * FROM c WHERE c.category = 'rsvp'";
    params = [];
  }

  const { resources } = await container.items
    .query({ query, parameters: params })
    .fetchAll();

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, rsvps: resources })
  };
}

async function handleCreateRsvp(context, req) {
  const body = req.body || {};
  const container = getContainer();

  // Check if email already has an RSVP
  if (body.email) {
    const emailLower = body.email.toLowerCase();
    const { resources } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.category = 'rsvp' AND LOWER(c.email) = @email",
        parameters: [{ name: "@email", value: emailLower }]
      })
      .fetchAll();
    
    if (resources.length > 0) {
      // Already registered — don't create duplicate, prompt user to update
      const existing = resources[0];
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, alreadyRegistered: true, rsvp: existing })
      };
      return;
    }
  }

  const rsvp = {
    id: "rsvp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    category: "rsvp",
    eventId: body.eventId,
    name: body.name,
    email: body.email,
    guests: body.guests,
    message: body.message,
    createdAt: new Date().toISOString()
  };

  await container.items.create(rsvp);

  // Send confirmation emails (non-blocking)
  sendRsvpEmails(rsvp).catch(err => console.log("Email error:", err.message));

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, rsvp })
  };
}

async function handleUpdateRsvp(context, req) {
  const body = req.body || {};
  if (!body.id) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "RSVP ID required." }) };
    return;
  }
  const container = getContainer();
  const { resource: doc } = await container.item(body.id, "rsvp").read();
  if (!doc) {
    context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "RSVP not found." }) };
    return;
  }
  doc.name = body.name || doc.name;
  doc.guests = body.guests || doc.guests;
  doc.message = body.message !== undefined ? body.message : doc.message;
  doc.updatedAt = new Date().toISOString();
  await container.item(doc.id, "rsvp").replace(doc);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: true, rsvp: doc }) };
}

async function handleCancelRsvp(context, req) {
  const id = req.query && req.query.id;
  if (!id) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "RSVP ID required." }) };
    return;
  }
  const container = getContainer();
  await container.item(id, "rsvp").delete();
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: true, message: "RSVP cancelled." }) };
}

async function handleRsvpLookup(context, req) {
  const email = req.query && req.query.email;
  if (!email) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Email required." }) };
    return;
  }
  const container = getContainer();
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.category = 'rsvp' AND c.email = @email",
      parameters: [{ name: "@email", value: email }]
    }).fetchAll();
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: true, rsvps: resources }) };
}

async function handleEmailCampaign(context, req) {
  const admin = await requireAdmin(context, req);
  if (!admin) return;

  const container = getContainer();
  const recipients = await getBabyShowerEmailRecipients();
  const record = await getCampaignRecord(container);
  const sentRecipients = new Set((record && record.sentRecipients) || []);
  const pendingRecipients = recipients.filter(recipient => !sentRecipients.has(recipient.email));
  const shareCards = await getBabyShowerShareCards(container);
  const babyShowerAccess = getBabyShowerAccessConfig();
  const preview = buildBabyShowerAnnouncement("Ananya", babyShowerAccess);

  if (req.method === "GET") {
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        campaign: {
          id: BABY_SHOWER_CAMPAIGN_ID,
          subject: preview.subject,
          totalRecipients: recipients.length,
          sentCount: sentRecipients.size,
          pendingCount: pendingRecipients.length,
          status: record ? record.status : "draft",
          completedAt: record && record.completedAt,
          recipients: recipients.map(recipient => ({
            name: recipient.name,
            email: maskEmail(recipient.email),
            sent: sentRecipients.has(recipient.email)
          })),
          shareCards: shareCards.map(card => ({
            id: card.id,
            name: card.name,
            email: card.email || "",
            phone: card.phone || "",
            videoTimestamp: card.videoTimestamp || "",
            collageUrl: card.collageUrl || "",
            createdAt: card.createdAt,
            emailSentAt: card.emailSentAt || "",
            whatsappOpenedAt: card.whatsappOpenedAt || ""
          })),
          previewHtml: preview.htmlBody
        }
      })
    };
    return;
  }

  const body = req.body || {};
  const mode = String(body.mode || "").toLowerCase();

  if (mode === "collage-upload") {
    const collageUrl = await storeShareCollage(body.collageBase64);
    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ success: true, mode: "collage-upload", collageUrl })
    };
    return;
  }

  if (mode === "save-share-card") {
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = normalizeWhatsAppPhone(body.phone);
    const collageUrl = validateCollageUrl(body.collageUrl);
    buildVideoMomentUrl(body.videoTimestamp);

    if (!name) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Enter the recipient name." })
      };
      return;
    }
    if (email && !isValidEmail(email)) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Enter a valid recipient email address." })
      };
      return;
    }
    if (!email && !phone) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Enter an email address or WhatsApp number." })
      };
      return;
    }

    const now = new Date().toISOString();
    const card = {
      id: `babyshower-share-card_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      category: BABY_SHOWER_SHARE_CARD_CATEGORY,
      name,
      email,
      phone,
      videoTimestamp: String(body.videoTimestamp || "").trim(),
      collageUrl,
      createdAt: now,
      createdBy: admin.username
    };
    await container.items.create(card);
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, mode: "save-share-card", card })
    };
    return;
  }

  if (mode === "delete-share-card") {
    const card = shareCards.find(item => item.id === body.id);
    if (!card) {
      context.res = {
        status: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Saved card not found." })
      };
      return;
    }
    await container.item(card.id, BABY_SHOWER_SHARE_CARD_CATEGORY).delete();
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, mode: "delete-share-card" })
    };
    return;
  }

  if (mode === "whatsapp-card") {
    const card = shareCards.find(item => item.id === body.id);
    if (!card) {
      context.res = {
        status: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Saved card not found." })
      };
      return;
    }
    card.whatsappOpenedAt = new Date().toISOString();
    await container.item(card.id, BABY_SHOWER_SHARE_CARD_CATEGORY).replace(card);
    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        success: true,
        mode: "whatsapp-card",
        phone: card.phone || "",
        message: buildBabyShowerWhatsAppMessage(
          card.name,
          babyShowerAccess,
          card.collageUrl,
          card.videoTimestamp
        )
      })
    };
    return;
  }

  if (mode === "send-share-card") {
    const card = shareCards.find(item => item.id === body.id);
    if (!card) {
      context.res = {
        status: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Saved card not found." })
      };
      return;
    }
    if (card.emailSentAt) {
      context.res = {
        status: 409,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "This saved card email has already been sent." })
      };
      return;
    }
    const result = await sendSavedShareCardEmail(container, card, babyShowerAccess);
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, mode: "send-share-card", status: result.status })
    };
    return;
  }

  if (mode === "send-share-cards") {
    const pendingCards = shareCards.filter(card => card.email && !card.emailSentAt);
    if (!pendingCards.length) {
      context.res = {
        status: 409,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "There are no saved cards with pending emails." })
      };
      return;
    }
    const requiredConfirmation = `SEND ${pendingCards.length} SAVED EMAIL${pendingCards.length === 1 ? "" : "S"}`;
    if (body.confirmation !== requiredConfirmation) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: `Type "${requiredConfirmation}" to confirm.` })
      };
      return;
    }

    const results = await runWithConcurrency(
      pendingCards,
      3,
      card => sendSavedShareCardEmail(container, card, babyShowerAccess)
    );

    const sent = [];
    const failed = [];
    results.forEach((result, index) => {
      const card = pendingCards[index];
      if (result.status === "fulfilled") sent.push(result.value);
      else failed.push({ id: card.id, email: card.email, error: result.reason.message });
    });
    context.res = {
      status: failed.length ? 207 : 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: failed.length === 0,
        mode: "send-share-cards",
        sentCount: sent.length,
        failedCount: failed.length,
        failed
      })
    };
    return;
  }

  if (mode === "whatsapp") {
    const phone = normalizeWhatsAppPhone(body.phone);
    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        success: true,
        mode: "whatsapp",
        phone,
        message: buildBabyShowerWhatsAppMessage(body.name, babyShowerAccess, body.collageUrl, body.videoTimestamp)
      })
    };
    return;
  }

  if (mode === "test") {
    const testEmail = String(body.testEmail || "").trim().toLowerCase();
    if (!isValidEmail(testEmail)) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Enter a valid test email address." })
      };
      return;
    }

    const message = buildBabyShowerAnnouncement(body.testName || "Friend", babyShowerAccess);
    const result = await sendEmail({ to: testEmail, ...message });
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, mode: "test", status: result.status })
    };
    return;
  }

  if (mode === "share") {
    const shareEmail = String(body.email || "").trim().toLowerCase();
    if (!isValidEmail(shareEmail)) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Enter a valid recipient email address." })
      };
      return;
    }

    const message = buildBabyShowerAnnouncement(body.name || "Friend", babyShowerAccess, {
      url: body.collageUrl,
      contentInBase64: body.collageBase64,
      videoTimestamp: body.videoTimestamp
    });
    const result = await sendEmail({ to: shareEmail, ...message });
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, mode: "share", status: result.status })
    };
    return;
  }

  if (mode !== "send") {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Unsupported email campaign mode." })
    };
    return;
  }

  const now = Date.now();
  if (record && record.status === "sending" && Date.parse(record.lockExpiresAt || "") > now) {
    context.res = {
      status: 409,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "This campaign is already being sent. Refresh the status before retrying." })
    };
    return;
  }

  if (!pendingRecipients.length) {
    context.res = {
      status: 409,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "This campaign has already been sent to every eligible RSVP email." })
    };
    return;
  }

  const requiredConfirmation = `SEND TO ${pendingRecipients.length} PARTICIPANTS`;
  if (body.confirmation !== requiredConfirmation) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: `Type "${requiredConfirmation}" to confirm.` })
    };
    return;
  }

  const startedAt = new Date().toISOString();
  const lockDocument = {
    id: BABY_SHOWER_CAMPAIGN_ID,
    category: "email-campaign",
    campaignType: "babyshower-memories",
    status: "sending",
    subject: preview.subject,
    totalRecipients: recipients.length,
    sentRecipients: [...sentRecipients],
    startedAt: (record && record.startedAt) || startedAt,
    startedBy: (record && record.startedBy) || admin.username,
    updatedAt: startedAt,
    lockExpiresAt: new Date(now + 30 * 60 * 1000).toISOString()
  };

  let lockedRecord;
  try {
    if (record) {
      const response = await container
        .item(BABY_SHOWER_CAMPAIGN_ID, "email-campaign")
        .replace(lockDocument, {
          accessCondition: { type: "IfMatch", condition: record._etag }
        });
      lockedRecord = response.resource;
    } else {
      const response = await container.items.create(lockDocument);
      lockedRecord = response.resource;
    }
  } catch (error) {
    if (error.code === 409 || error.code === 412 || error.statusCode === 409 || error.statusCode === 412) {
      context.res = {
        status: 409,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Another campaign send started first. Refresh the status before retrying." })
      };
      return;
    }
    throw error;
  }

  const results = await runWithConcurrency(pendingRecipients, 3, async recipient => {
    const message = buildBabyShowerAnnouncement(recipient.name, babyShowerAccess);
    const result = await sendEmail({ to: recipient.email, ...message });
    return { email: recipient.email, status: result.status };
  });

  const newlySent = [];
  const failed = [];
  results.forEach((result, index) => {
    const recipient = pendingRecipients[index];
    if (result.status === "fulfilled") {
      newlySent.push(recipient.email);
    } else {
      failed.push({ email: recipient.email, error: result.reason.message });
    }
  });

  const allSent = [...new Set([...sentRecipients, ...newlySent])];
  const completed = allSent.length === recipients.length;
  const finalDocument = {
    id: BABY_SHOWER_CAMPAIGN_ID,
    category: "email-campaign",
    campaignType: "babyshower-memories",
    status: completed ? "completed" : "partial",
    subject: preview.subject,
    totalRecipients: recipients.length,
    sentRecipients: allSent,
    failedRecipients: failed,
    startedAt: (record && record.startedAt) || startedAt,
    completedAt: completed ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
    startedBy: (record && record.startedBy) || admin.username
  };
  await container
    .item(BABY_SHOWER_CAMPAIGN_ID, "email-campaign")
    .replace(finalDocument, {
      accessCondition: { type: "IfMatch", condition: lockedRecord._etag }
    });

  context.res = {
    status: failed.length ? 207 : 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      success: failed.length === 0,
      sentNow: newlySent.length,
      sentTotal: allSent.length,
      failedCount: failed.length,
      pendingCount: recipients.length - allSent.length,
      error: failed.length ? "Some emails could not be delivered. The campaign can safely retry only pending recipients." : undefined
    })
  };
}

// --- Registry ---

async function handleGetRegistry(context, req) {
  const eventId = req.query && req.query.eventId;
  const container = getContainer();

  let query, params;
  if (eventId) {
    query = "SELECT * FROM c WHERE c.category = 'registry' AND c.eventId = @eventId";
    params = [{ name: "@eventId", value: eventId }];
  } else {
    query = "SELECT * FROM c WHERE c.category = 'registry'";
    params = [];
  }

  const { resources } = await container.items
    .query({ query, parameters: params })
    .fetchAll();

  const sorted = resources.sort((a, b) => (a.order || 0) - (b.order || 0));

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, items: sorted })
  };
}

async function handleCreateRegistryItem(context, req) {
  const body = req.body || {};
  const item = {
    id: "registry_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    category: "registry",
    eventId: body.eventId,
    name: body.name,
    price: body.price,
    url: body.url,
    image: body.image || body.imageUrl,
    amazonUrl: body.amazonUrl || body.url,
    status: "available",
    claimedBy: null,
    claimedEmail: null,
    claimed: false,
    order: body.order || 0,
    createdAt: new Date().toISOString()
  };

  const container = getContainer();
  await container.items.create(item);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, item })
  };
}

async function handleClaimRegistryItem(context, req) {
  const { id, claimedBy, claimedEmail } = req.body || {};
  if (!id) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Item ID is required." })
    };
    return;
  }

  const container = getContainer();
  const { resource: doc } = await container.item(id, "registry").read();

  if (!doc) {
    context.res = {
      status: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Registry item not found." })
    };
    return;
  }

  doc.status = "gone";
  doc.claimed = true;
  doc.claimedBy = claimedBy;
  doc.claimedEmail = claimedEmail;
  doc.claimedAt = new Date().toISOString();

  await container.item(id, "registry").replace(doc);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, item: doc })
  };
}

async function handleUpdateRegistryItem(context, req) {
  const body = req.body || {};
  if (!body.id) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Item ID required." }) };
    return;
  }
  const container = getContainer();
  const { resource: doc } = await container.item(body.id, "registry").read();
  if (!doc) {
    context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Item not found." }) };
    return;
  }
  if (body.name) doc.name = body.name;
  if (body.price) doc.price = body.price;
  if (body.amazonUrl !== undefined) doc.amazonUrl = body.amazonUrl;
  if (body.image !== undefined) doc.image = body.image;
  if (body.status) {
    doc.status = body.status;
    if (body.status === "available") {
      doc.claimed = false;
      delete doc.claimedBy;
      delete doc.claimedEmail;
      delete doc.claimedAt;
    }
  }
  doc.updatedAt = new Date().toISOString();
  await container.item(body.id, "registry").replace(doc);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: true, item: doc }) };
}

async function handleDeleteRegistryItem(context, req) {
  const id = req.query && req.query.id;
  if (!id) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Registry item ID is required." })
    };
    return;
  }

  const container = getContainer();
  await container.item(id, "registry").delete();

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, message: "Registry item deleted." })
  };
}

async function handleUnclaimRegistryItem(context, req) {
  const { id, email } = req.body || {};
  if (!id || !email) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Item ID and email required." }) };
    return;
  }
  const container = getContainer();
  const { resource: doc } = await container.item(id, "registry").read();
  if (!doc) {
    context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Item not found." }) };
    return;
  }
  if (doc.claimedEmail !== email) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "This item was not claimed by you." }) };
    return;
  }
  doc.status = "available";
  doc.claimed = false;
  doc.claimedBy = null;
  doc.claimedEmail = null;
  doc.claimedAt = null;
  await container.item(id, "registry").replace(doc);
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: true, item: doc }) };
}

async function handleMyClaims(context, req) {
  const email = req.query && req.query.email;
  if (!email) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Email required." }) };
    return;
  }
  const container = getContainer();
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.category = 'registry' AND c.claimedEmail = @email",
      parameters: [{ name: "@email", value: email }]
    }).fetchAll();
  context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: true, items: resources }) };
}

// --- AI Photo Analysis ---

async function handleAnalyzePhoto(context, req) {
  const { url, caption } = req.body || {};
  if (!url) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Photo URL is required." })
    };
    return;
  }

  const visionEndpoint = process.env.VISION_ENDPOINT;
  const visionKey = process.env.VISION_KEY;

  if (!visionEndpoint || !visionKey) {
    // Fallback: save without AI tags
    return await savePhotoWithAlbum(context, url, caption, "uncategorized", []);
  }

  // Call Azure Computer Vision API
  const https = require("https");
  const analysisUrl = new URL("/vision/v3.2/analyze?visualFeatures=Tags,Description,Faces,Categories", visionEndpoint);

  const tags = await new Promise((resolve, reject) => {
    const options = {
      hostname: analysisUrl.hostname,
      path: analysisUrl.pathname + analysisUrl.search,
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": visionKey,
        "Content-Type": "application/json"
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Vision API parse error")); }
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify({ url }));
    req.end();
  });

  // Auto-categorize based on AI tags
  const album = categorizePhoto(tags);
  const aiTags = (tags.tags || []).map(t => t.name);
  const aiDescription = (tags.description && tags.description.captions && tags.description.captions[0])
    ? tags.description.captions[0].text : "";
  const faceCount = (tags.faces || []).length;

  await savePhotoWithAlbum(context, url, caption || aiDescription, album, aiTags, faceCount);
}

function categorizePhoto(analysis) {
  const tags = (analysis.tags || []).map(t => t.name.toLowerCase());
  const categories = (analysis.categories || []).map(c => c.name.toLowerCase());
  const faceCount = (analysis.faces || []).length;

  // Couple photo: exactly 2 faces
  if (faceCount === 2) {
    if (tags.some(t => ["wedding", "bride", "groom", "ceremony", "dress"].includes(t))) return "wedding";
    if (tags.some(t => ["ring", "engagement", "propose"].includes(t))) return "engagement";
    return "couple";
  }

  // Baby
  if (tags.some(t => ["baby", "infant", "child", "newborn", "toddler", "diaper", "nursery"].includes(t))) return "baby";

  // Travel/nature
  if (tags.some(t => ["mountain", "beach", "ocean", "sea", "lake", "temple", "monument", "airplane", "airport", "luggage", "backpack"].includes(t))) return "travel";
  if (categories.some(c => c.includes("outdoor") || c.includes("building"))) return "travel";

  // Wedding/celebration
  if (tags.some(t => ["wedding", "bride", "groom", "ceremony", "celebration", "cake", "party", "decoration"].includes(t))) return "celebrations";

  // Food
  if (tags.some(t => ["food", "plate", "restaurant", "meal", "cake"].includes(t))) return "food";

  // People/group
  if (faceCount > 2) return "family";
  if (faceCount === 1) return "portrait";

  return "general";
}

async function savePhotoWithAlbum(context, url, caption, album, aiTags, faceCount) {
  const photo = {
    id: "photo_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    category: "photo",
    album,
    url,
    caption: caption || "",
    aiTags: aiTags || [],
    faceCount: faceCount || 0,
    order: 0,
    createdAt: new Date().toISOString()
  };

  const container = getContainer();
  await container.items.create(photo);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, photo })
  };
}

// --- Blob Upload SAS URL Generator ---

async function handleGetUploadUrl(context, req) {
  const admin = await requireAdmin(context, req);
  if (!admin) return;

  const { fileName, contentType, folder } = req.body || {};
  if (!fileName) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "fileName is required." }) };
    return;
  }

  const connStr = process.env.STORAGE_CONNECTION_STRING;
  if (!connStr) {
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Storage not configured." }) };
    return;
  }

  // Parse connection string for account name and key
  const parts = {};
  connStr.split(";").forEach(part => {
    const [key, ...vals] = part.split("=");
    parts[key] = vals.join("=");
  });
  const accountName = parts["AccountName"];
  const accountKey = parts["AccountKey"];
  const containerName = "photos";

  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobName = folder ? `${folder}/${fileName}` : fileName;

  // Generate SAS token valid for 10 minutes
  const startsOn = new Date();
  const expiresOn = new Date(startsOn.getTime() + 10 * 60 * 1000);

  const sasToken = generateBlobSASQueryParameters({
    containerName,
    blobName,
    permissions: BlobSASPermissions.parse("cw"),
    startsOn,
    expiresOn,
    contentType: contentType || "application/octet-stream"
  }, credential).toString();

  const blobUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}`;
  const uploadUrl = `${blobUrl}?${sasToken}`;

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, uploadUrl, blobUrl })
  };
}

async function handleDownload(context, req) {
  const sourceUrl = req.query && req.query.url;
  if (!sourceUrl) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Photo URL is required." }) };
    return;
  }

  const connStr = process.env.STORAGE_CONNECTION_STRING;
  if (!connStr) {
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Storage not configured." }) };
    return;
  }

  const parts = {};
  connStr.split(";").forEach(part => {
    const [key, ...vals] = part.split("=");
    parts[key] = vals.join("=");
  });

  const accountName = parts["AccountName"];
  const accountKey = parts["AccountKey"];
  const url = new URL(sourceUrl);
  const containerPrefix = "/photos/";
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== `${accountName}.blob.core.windows.net`.toLowerCase() || !url.pathname.startsWith(containerPrefix)) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Invalid photo URL." }) };
    return;
  }

  const blobName = decodeURIComponent(url.pathname.slice(containerPrefix.length));
  const fileName = (blobName.split("/").pop() || "album-photo").replace(/[^a-zA-Z0-9._-]/g, "_");
  const startsOn = new Date();
  const expiresOn = new Date(startsOn.getTime() + 5 * 60 * 1000);
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const sasToken = generateBlobSASQueryParameters({
    containerName: "photos",
    blobName,
    permissions: BlobSASPermissions.parse("r"),
    startsOn,
    expiresOn,
    contentDisposition: `attachment; filename="${fileName}"`
  }, credential).toString();

  context.res = {
    status: 302,
    headers: {
      Location: `https://${accountName}.blob.core.windows.net/photos/${url.pathname.slice(containerPrefix.length)}?${sasToken}`,
      "Cache-Control": "no-store"
    }
  };
}

// --- List Blob Photos (for admin bulk manager) ---
async function handleListBlobPhotos(context, req) {
  const connStr = process.env.STORAGE_CONNECTION_STRING;
  if (!connStr) {
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Storage not configured." }) };
    return;
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
  const containerClient = blobServiceClient.getContainerClient("photos");
  const prefix = (req.query && req.query.prefix) || "photos/";

  const blobs = [];
  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    if (/\.(jpg|jpeg|png|gif|webp|mp4|mov)$/i.test(blob.name)) {
      blobs.push({
        name: blob.name,
        url: `https://${blobServiceClient.accountName}.blob.core.windows.net/photos/${blob.name}`,
        size: blob.properties.contentLength,
        lastModified: blob.properties.lastModified
      });
    }
  }

  // Also get list of photos already in Cosmos to mark which are categorized
  const container = getContainer();
  const { resources } = await container.items
    .query("SELECT c.url FROM c WHERE c.category = 'photo'")
    .fetchAll();
  const existingUrls = new Set(resources.map(r => r.url));

  const result = blobs.map(b => ({
    ...b,
    inGallery: existingUrls.has(b.url)
  }));

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, photos: result })
  };
}

// --- Amazon Product Scraper ---

async function handleScrapeAmazon(context, req) {
  const { url } = req.body || {};
  if (!url) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "URL is required." })
    };
    return;
  }

  try {
    const https = require("https");
    const http = require("http");
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const html = await new Promise((resolve, reject) => {
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "identity"
        }
      };
      const request = client.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url);
          const rClient = redirectUrl.protocol === "https:" ? https : http;
          rClient.get(redirectUrl.href, { headers: options.headers }, (rRes) => {
            let data = "";
            rRes.on("data", chunk => data += chunk);
            rRes.on("end", () => resolve(data));
          }).on("error", reject);
          return;
        }
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => resolve(data));
      });
      request.on("error", reject);
      request.end();
    });

    const product = parseAmazonHtml(html, url);

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, product })
    };
  } catch (e) {
    context.log.error("Amazon scrape error:", e.message);
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Could not fetch product details." })
    };
  }
}

function parseAmazonHtml(html, url) {
  const product = { name: "", price: "", image: "", url };

  // Extract title
  const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>([\s\S]*?)<\/span>/i)
    || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    product.name = titleMatch[1].replace(/<[^>]+>/g, "").trim()
      .replace(/Amazon\.in\s*[:\-]\s*/i, "")
      .replace(/\s*[:\-]\s*Amazon\.in/i, "")
      .substring(0, 120);
  }

  // Extract price
  const priceMatch = html.match(/class="a-price-whole"[^>]*>([\d,]+)/i)
    || html.match(/id="priceblock_ourprice"[^>]*>[^₹]*₹\s*([\d,]+)/i)
    || html.match(/₹\s*([\d,]+(?:\.\d+)?)/i)
    || html.match(/class="a-offscreen"[^>]*>₹([\d,]+)/i);
  if (priceMatch) {
    product.price = "₹" + priceMatch[1].trim();
  }

  // Extract image
  const imgMatch = html.match(/"hiRes"\s*:\s*"(https:[^"]+)"/i)
    || html.match(/"large"\s*:\s*"(https:[^"]+)"/i)
    || html.match(/id="landingImage"[^>]*src="(https:[^"]+)"/i)
    || html.match(/data-old-hires="(https:[^"]+)"/i);
  if (imgMatch) {
    product.image = imgMatch[1];
  }

  return product;
}

// --- Site Settings (hero photos, etc.) ---

async function handleGetSettings(context, req) {
  const container = getContainer();
  try {
    const { resource } = await container.item("site-settings", "settings").read();
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, settings: resource || {} })
    };
  } catch (e) {
    // No settings doc yet — return defaults
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, settings: {} })
    };
  }
}

async function handleUpdateSettings(context, req) {
  const updates = req.body || {};
  const container = getContainer();

  let settings;
  try {
    const { resource } = await container.item("site-settings", "settings").read();
    if (!resource) throw new Error("not found");
    settings = resource;
  } catch (e) {
    settings = { id: "site-settings", category: "settings" };
  }

  // Merge updates (only allowed fields)
  const allowed = ["heroPhotoLeft", "heroPhotoRight", "heroPhotoLeftAlt", "heroPhotoRightAlt"];
  allowed.forEach(key => {
    if (updates[key] !== undefined) settings[key] = updates[key];
  });
  settings.updatedAt = new Date().toISOString();

  try {
    await container.item("site-settings", "settings").replace(settings);
  } catch (e) {
    await container.items.create(settings);
  }

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, settings })
  };
}

async function handleChangePassword(context, req) {
  const { currentPassword, newPassword, totpCode } = req.body || {};
  if (!currentPassword || !newPassword) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Current and new password are required." })
    };
    return;
  }
  if (newPassword.length < 6) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "New password must be at least 6 characters." })
    };
    return;
  }

  const container = getContainer();
  const currentHash = crypto.createHash("sha256").update(currentPassword).digest("hex");

  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.category = 'admin' AND c.passwordHash = @hash",
      parameters: [{ name: "@hash", value: currentHash }]
    })
    .fetchAll();

  if (resources.length === 0) {
    context.res = {
      status: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Current password is incorrect." })
    };
    return;
  }

  const user = resources[0];

  // If 2FA is enabled, require TOTP code
  if (user.totpEnabled && user.totpSecret) {
    if (!totpCode) {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "2FA code is required.", requires2FA: true })
      };
      return;
    }
    const isValid = authenticator.check(totpCode, user.totpSecret);
    if (!isValid) {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Invalid 2FA code. Please try again." })
      };
      return;
    }
  }

  user.passwordHash = crypto.createHash("sha256").update(newPassword).digest("hex");
  user.activeTokens = [];
  user.updatedAt = new Date().toISOString();

  await container.item(user.id, "admin").replace(user);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, message: "Password updated. Please log in again." })
  };
}

// --- 2FA Setup & Verification ---

async function handleGet2FAStatus(context, req) {
  const token = (req.query && req.query.token) || req.headers["x-admin-token"];
  if (!token) {
    context.res = { status: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Not authenticated." }) };
    return;
  }
  const container = getContainer();
  const { resources } = await container.items
    .query({ query: "SELECT * FROM c WHERE c.category = 'admin' AND ARRAY_CONTAINS(c.activeTokens, @token)", parameters: [{ name: "@token", value: token }] })
    .fetchAll();
  if (resources.length === 0) {
    context.res = { status: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Invalid session." }) };
    return;
  }
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, enabled: !!resources[0].totpEnabled })
  };
}

async function handleSetup2FA(context, req) {
  const { token } = req.body || {};
  if (!token) {
    context.res = { status: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Not authenticated." }) };
    return;
  }

  const container = getContainer();
  const { resources } = await container.items
    .query({ query: "SELECT * FROM c WHERE c.category = 'admin' AND ARRAY_CONTAINS(c.activeTokens, @token)", parameters: [{ name: "@token", value: token }] })
    .fetchAll();

  if (resources.length === 0) {
    context.res = { status: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Invalid session." }) };
    return;
  }

  const user = resources[0];
  const secret = authenticator.generateSecret();
  const siteName = process.env.SITE_NAME || "Journey Admin";
  const otpauth = authenticator.keyuri(user.username || "admin", siteName, secret);

  // Generate QR code as data URL
  const qrDataUrl = await QRCode.toDataURL(otpauth);

  // Store secret temporarily (not yet enabled — user must verify first)
  user.totpPendingSecret = secret;
  user.updatedAt = new Date().toISOString();
  await container.item(user.id, "admin").replace(user);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, qrCode: qrDataUrl, secret, message: "Scan the QR code with Google Authenticator, then enter the 6-digit code to verify." })
  };
}

async function handleVerify2FA(context, req) {
  const { token, code, action } = req.body || {};
  if (!token || !code) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Token and code are required." }) };
    return;
  }

  const container = getContainer();
  const { resources } = await container.items
    .query({ query: "SELECT * FROM c WHERE c.category = 'admin' AND ARRAY_CONTAINS(c.activeTokens, @token)", parameters: [{ name: "@token", value: token }] })
    .fetchAll();

  if (resources.length === 0) {
    context.res = { status: 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Invalid session." }) };
    return;
  }

  const user = resources[0];

  // Disable 2FA
  if (action === "disable") {
    if (!user.totpEnabled || !user.totpSecret) {
      context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "2FA is not enabled." }) };
      return;
    }
    const isValid = authenticator.check(code, user.totpSecret);
    if (!isValid) {
      context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Invalid 2FA code." }) };
      return;
    }
    user.totpEnabled = false;
    user.totpSecret = null;
    user.totpPendingSecret = null;
    user.updatedAt = new Date().toISOString();
    await container.item(user.id, "admin").replace(user);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: true, message: "2FA has been disabled." }) };
    return;
  }

  // Enable 2FA — verify the pending secret
  const pendingSecret = user.totpPendingSecret;
  if (!pendingSecret) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "No 2FA setup in progress. Start setup first." }) };
    return;
  }

  const isValid = authenticator.check(code, pendingSecret);
  if (!isValid) {
    context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Invalid code. Make sure you scanned the QR code and entered the current 6-digit code." }) };
    return;
  }

  // Activate 2FA
  user.totpSecret = pendingSecret;
  user.totpEnabled = true;
  user.totpPendingSecret = null;
  user.updatedAt = new Date().toISOString();
  await container.item(user.id, "admin").replace(user);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, message: "2FA is now enabled! You'll need the authenticator code for password changes." })
  };
}
