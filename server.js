const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, "week-data.json");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "{}", "utf8");
  }
}

function readStore() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (_) {
    return {};
  }
}

function writeStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function handleApi(req, res, urlObj) {
  if (req.method === "GET") {
    const weekKey = urlObj.searchParams.get("weekKey");
    if (!weekKey) {
      return sendJson(res, 400, { error: "Missing weekKey" });
    }
    const store = readStore();
    return sendJson(res, 200, { data: store[weekKey] ?? null });
  }

  if (req.method === "PUT") {
    return parseBody(req)
      .then(body => {
        const weekKey = body.weekKey;
        const data = body.data;
        if (!weekKey || typeof weekKey !== "string") {
          return sendJson(res, 400, { error: "Invalid weekKey" });
        }
        if (typeof data !== "object" || data === null) {
          return sendJson(res, 400, { error: "Invalid data payload" });
        }
        const store = readStore();
        store[weekKey] = data;
        writeStore(store);
        return sendJson(res, 200, { ok: true });
      })
      .catch(() => sendJson(res, 400, { error: "Invalid JSON body" }));
  }

  return sendJson(res, 405, { error: "Method not allowed" });
}

function safeFilePath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const target = decoded === "/" ? "/index.html" : decoded;
  const normalized = path.normalize(target).replace(/^(\.\.[\/\\])+/, "");
  return path.join(ROOT_DIR, normalized);
}

function handleStatic(req, res, urlObj) {
  const filePath = safeFilePath(urlObj.pathname);
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  if (urlObj.pathname === "/api/week-data") {
    return handleApi(req, res, urlObj);
  }
  return handleStatic(req, res, urlObj);
});

server.listen(PORT, () => {
  ensureDataFile();
  // eslint-disable-next-line no-console
  console.log(`PokeLiga server running at http://localhost:${PORT}`);
});
