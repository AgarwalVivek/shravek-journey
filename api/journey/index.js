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
