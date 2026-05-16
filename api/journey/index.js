const { CosmosClient } = require("@azure/cosmos");
const crypto = require("crypto");

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
        if (req.method === "DELETE") return await handleDeleteEvent(context, req);
        break;

      case "rsvp":
        if (req.method === "GET") return await handleGetRsvps(context, req);
        if (req.method === "POST") return await handleCreateRsvp(context, req);
        break;

      case "registry":
        if (req.method === "GET") return await handleGetRegistry(context, req);
        if (req.method === "POST") return await handleCreateRegistryItem(context, req);
        if (req.method === "PUT") return await handleClaimRegistryItem(context, req);
        if (req.method === "DELETE") return await handleDeleteRegistryItem(context, req);
        break;

      case "analyze-photo":
        if (req.method === "POST") return await handleAnalyzePhoto(context, req);
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

  const container = getContainer();
  await container.items.create(rsvp);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, rsvp })
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
    imageUrl: body.imageUrl,
    claimedBy: body.claimedBy || null,
    claimedEmail: body.claimedEmail || null,
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

  doc.claimed = true;
  doc.claimedBy = claimedBy;
  doc.claimedEmail = claimedEmail;

  await container.item(id, "registry").replace(doc);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, item: doc })
  };
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
