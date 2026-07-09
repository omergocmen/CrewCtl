// server.js — saf Node http sunucusu: REST API + SSE + statik web paneli
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const store = require("./store");
const engine = require("./engine");

const PORT = process.env.PORT || 4317;
const WEB = path.join(store.ROOT, "web");

store.ensureDirs();

// ---- SSE istemcileri ----
const clients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {}
  }
}
engine.on("log", (d) => broadcast("log", d));
engine.on("chunk", (d) => broadcast("chunk", d));
engine.on("status", (d) => broadcast("status", d));
engine.on("result", (d) => broadcast("result", d));
engine.on("agent", (d) => broadcast("agent", d));
engine.on("queue", () => broadcast("queue", snapshot()));

function snapshot() {
  return {
    pending: store.listTasks("pending"),
    approval: store.listTasks("approval"),
    done: store.listTasks("done").slice(-30).reverse(),
    failed: store.listTasks("failed").slice(-30).reverse(),
  };
}

// ---- yardimcilar ----
function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      try {
        resolve(b ? JSON.parse(b) : {});
      } catch {
        resolve({});
      }
    });
  });
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
function serveStatic(res, file) {
  const p = path.join(WEB, file);
  if (!p.startsWith(WEB) || !fs.existsSync(p)) {
    res.writeHead(404);
    return res.end("not found");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "text/plain" });
  fs.createReadStream(p).pipe(res);
}

// ---- Klasor gezgini ----
function listDrives() {
  const drives = [];
  for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const d = c + ":\\";
    try { fs.accessSync(d); drives.push(d); } catch {}
  }
  return drives;
}
function browseDir(p) {
  try {
    if (!p) {
      if (process.platform === "win32") return { path: "", parent: null, dirs: listDrives(), isRoot: true };
      p = "/";
    }
    const abs = path.resolve(p);
    const dirs = fs
      .readdirSync(abs, { withFileTypes: true })
      .filter((e) => { try { return e.isDirectory(); } catch { return false; } })
      .map((e) => e.name)
      .filter((n) => !n.startsWith("$") && n !== "System Volume Information")
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const isDriveRoot = /^[A-Za-z]:\\?$/.test(abs);
    const up = path.dirname(abs);
    const parent = isDriveRoot ? "" : up === abs ? null : up;
    return { path: abs, parent, dirs };
  } catch (e) {
    return { path: p || "", parent: null, dirs: [], error: e.message };
  }
}

// ---- HTTP ----
const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url, true);

  // SSE
  if (pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`event: status\ndata: ${JSON.stringify(engine.status())}\n\n`);
    res.write(`event: queue\ndata: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  // API
  if (pathname.startsWith("/api/")) {
    try {
      if (pathname === "/api/state" && req.method === "GET") {
        const cfg = store.loadConfig();
        return send(res, 200, {
          status: engine.status(),
          queue: snapshot(),
          config: cfg,
          roles: store.listRoles(),
          workingDirAbs: path.resolve(store.ROOT, cfg.workingDir || "."),
        });
      }
      if (pathname === "/api/fs" && req.method === "GET") {
        return send(res, 200, browseDir(url.parse(req.url, true).query.path));
      }
      if (pathname === "/api/tasks" && req.method === "POST") {
        const { prompt, targetDir } = await readBody(req);
        if (!prompt || !prompt.trim()) return send(res, 400, { error: "prompt gerekli" });
        const t = store.addTask(prompt.trim(), targetDir);
        engine.wake();
        broadcast("queue", snapshot());
        return send(res, 200, t);
      }
      let m;
      if ((m = pathname.match(/^\/api\/tasks\/([^/]+)\/(approve|reject)$/)) && req.method === "POST") {
        const found = store.findTask(m[1]);
        if (!found) return send(res, 404, { error: "gorev yok" });
        if (m[2] === "approve") {
          found.task.approved = true;
          found.task.status = "pending";
          store.moveTask(found.state, "pending", found.task);
        } else {
          store.moveTask(found.state, "failed", found.task);
        }
        broadcast("queue", snapshot());
        return send(res, 200, { ok: true });
      }
      if (pathname === "/api/engine" && req.method === "POST") {
        const { action, mode } = await readBody(req);
        if (mode) engine.setMode(mode);
        if (action === "start") engine.start();
        if (action === "stop") engine.stop();
        return send(res, 200, engine.status());
      }
      if (pathname === "/api/config" && req.method === "GET") {
        return send(res, 200, store.loadConfig());
      }
      if (pathname === "/api/config" && req.method === "PUT") {
        const cfg = await readBody(req);
        store.saveConfig(cfg);
        broadcast("status", engine.status());
        return send(res, 200, { ok: true });
      }
      if ((m = pathname.match(/^\/api\/roles\/(.+)$/))) {
        let file = decodeURIComponent(m[1]);
        if (!file.endsWith(".md")) file += ".md";
        if (req.method === "GET") return send(res, 200, { file, content: store.readRole(file) });
        if (req.method === "PUT") {
          const { content } = await readBody(req);
          store.writeRole(file, content || "");
          return send(res, 200, { ok: true, file });
        }
        if (req.method === "DELETE") {
          store.deleteRole(file);
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 404, { error: "bilinmeyen endpoint" });
    } catch (e) {
      return send(res, 500, { error: e.message });
    }
  }

  // Statik
  serveStatic(res, pathname === "/" ? "index.html" : pathname.slice(1));
});

server.listen(PORT, () => {
  console.log(`\n  AI Orkestrator paneli hazir:  http://localhost:${PORT}\n`);
});
