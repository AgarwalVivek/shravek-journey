const { CosmosClient } = require("@azure/cosmos");
const crypto = require("crypto");
const { authenticator } = require("otplib");
const QRCode = require("qrcode");
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require("@azure/storage-blob");

let cosmosContainer;

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

  // Check if email already has an RSVP for this event (upsert behavior)
  if (body.email && body.eventId) {
    const { resources } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.category = 'rsvp' AND c.email = @email AND c.eventId = @eventId",
        parameters: [
          { name: "@email", value: body.email },
          { name: "@eventId", value: body.eventId }
        ]
      }).fetchAll();
    
    if (resources.length > 0) {
      // Update existing RSVP
      const existing = resources[0];
      existing.name = body.name || existing.name;
      existing.guests = body.guests || existing.guests;
      existing.message = body.message !== undefined ? body.message : existing.message;
      existing.updatedAt = new Date().toISOString();
      await container.item(existing.id, "rsvp").replace(existing);
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, rsvp: existing, updated: true })
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
