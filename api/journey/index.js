const { CosmosClient } = require("@azure/cosmos");

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
        if (req.method === "GET") return handleGetPhotos(context, req);
        if (req.method === "POST") return handleAddPhoto(context, req);
        if (req.method === "DELETE") return handleDeletePhoto(context, req);
        break;

      case "timeline":
        if (req.method === "GET") return handleGetByCategory(context, "timeline");
        if (req.method === "POST") return handleAddItem(context, req, "timeline");
        if (req.method === "DELETE") return handleDeleteItem(context, req);
        break;

      case "travel":
        if (req.method === "GET") return handleGetByCategory(context, "travel");
        if (req.method === "POST") return handleAddItem(context, req, "travel");
        if (req.method === "DELETE") return handleDeleteItem(context, req);
        break;

      case "baby":
        if (req.method === "GET") return handleGetByCategory(context, "baby");
        if (req.method === "POST") return handleAddItem(context, req, "baby");
        if (req.method === "DELETE") return handleDeleteItem(context, req);
        break;

      case "all":
        return handleGetAll(context);

      default:
        context.res = {
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: { success: false, error: "Unknown action: " + action }
        };
    }
  } catch (error) {
    context.log.error("API error:", error);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { success: false, error: error.message }
    };
  }
};

// ── Get all data (for initial page load) ─────────────────
async function handleGetAll(context) {
  const container = getContainer();

  const { resources } = await container.items
    .query("SELECT * FROM c ORDER BY c.order ASC")
    .fetchAll();

  const grouped = {
    timeline: resources.filter(r => r.category === "timeline"),
    travel: resources.filter(r => r.category === "travel"),
    baby: resources.filter(r => r.category === "baby"),
    photos: resources.filter(r => r.category === "photo")
  };

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { success: true, data: grouped }
  };
}

// ── Get photos (optionally filtered by album) ────────────
async function handleGetPhotos(context, req) {
  const container = getContainer();
  const album = req.query && req.query.album;

  let query = "SELECT * FROM c WHERE c.category = 'photo'";
  const params = [{ name: "@cat", value: "photo" }];

  if (album) {
    query = "SELECT * FROM c WHERE c.category = 'photo' AND c.album = @album ORDER BY c.order ASC";
    params.push({ name: "@album", value: album });
  } else {
    query += " ORDER BY c.order ASC";
  }

  const { resources } = await container.items
    .query({ query, parameters: params })
    .fetchAll();

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { success: true, photos: resources }
  };
}

// ── Add a photo ──────────────────────────────────────────
async function handleAddPhoto(context, req) {
  const body = req.body || {};

  if (!body.url) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { success: false, error: "Photo URL is required." }
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
    body: { success: true, photo }
  };
}

// ── Delete a photo ───────────────────────────────────────
async function handleDeletePhoto(context, req) {
  const id = req.query && req.query.id;
  if (!id) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { success: false, error: "Photo ID is required." }
    };
    return;
  }

  const container = getContainer();
  await container.item(id, "photo").delete();

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { success: true, message: "Photo deleted." }
  };
}

// ── Get items by category ────────────────────────────────
async function handleGetByCategory(context, category) {
  const container = getContainer();

  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.category = @cat ORDER BY c.order ASC",
      parameters: [{ name: "@cat", value: category }]
    })
    .fetchAll();

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { success: true, items: resources }
  };
}

// ── Add item (timeline/travel/baby) ──────────────────────
async function handleAddItem(context, req, category) {
  const body = req.body || {};

  const item = {
    id: category + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    category,
    ...body,
    createdAt: new Date().toISOString()
  };

  // Ensure category is set correctly (overrides any body.category)
  item.category = category;

  const container = getContainer();
  await container.items.create(item);

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { success: true, item }
  };
}

// ── Delete item ──────────────────────────────────────────
async function handleDeleteItem(context, req) {
  const id = req.query && req.query.id;
  const category = req.query && req.query.category;

  if (!id || !category) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { success: false, error: "ID and category are required." }
    };
    return;
  }

  const container = getContainer();
  await container.item(id, category).delete();

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { success: true, message: "Item deleted." }
  };
}
