// server.js — saf Node http sunucusu: REST API + SSE + statik web paneli
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const url = require("url");
const store = require("./store");
const engine = require("./engine");
const cliRegistry = require("./cli-registry");

const PORT = process.env.PORT || 4317;
const HOST = process.env.HOST || "127.0.0.1";
const WEB = path.join(store.ROOT, "web");

store.ensureDirs();
let cliStatus = cliRegistry.discoverInstalled();
{
  const cfg = store.loadConfig();
  let changed = cliRegistry.addMissingAgents(cfg, cliStatus);
  if (cliRegistry.ensureValidOperator(cfg, cliStatus)) changed = true;
  if (changed) store.saveConfig(cfg);
}

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
engine.on("status", (d) => broadcast("status", d));
engine.on("result", (d) => broadcast("result", d));
engine.on("activity", (d) => broadcast("activity", d));
engine.on("message", (d) => broadcast("message", d));
engine.on("queue", () => broadcast("queue", snapshot()));

function snapshot() {
  return {
    pending: store.listTasks("pending"),
    approval: store.listTasks("approval"),
    done: store.listTasks("done").filter((task) => task.kind !== "operator-chat").slice(-30).reverse(),
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
  const p = path.resolve(WEB, file);
  if ((p !== WEB && !p.startsWith(WEB + path.sep)) || !fs.existsSync(p)) {
    res.writeHead(404);
    return res.end("not found");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "text/plain" });
  fs.createReadStream(p).pipe(res);
}

// ---- Klasor gezgini ----
let driveCache = { at: 0, value: [] };
function uniqExistingDirs(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item.path || seen.has(item.path.toLowerCase())) return false;
    seen.add(item.path.toLowerCase());
    try { return fs.statSync(item.path).isDirectory(); } catch { return false; }
  });
}
function listDrives() {
  if (Date.now() - driveCache.at < 30000) return driveCache.value.slice();
  const found = new Set();
  for (const d of [process.env.SystemDrive, process.env.HOMEDRIVE]) {
    if (d) found.add(path.parse(d).root || `${d.replace(/[\\/]$/, "")}\\`);
  }
  for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const d = c + ":\\";
    try {
      if (fs.statSync(d).isDirectory()) found.add(d);
    } catch {}
  }
  const drives = [...found].sort((a, b) => a.localeCompare(b));
  driveCache = { at: Date.now(), value: drives };
  return drives.slice();
}
function explorerPlaces() {
  const home = os.homedir();
  const oneDrive = process.env.OneDrive || process.env.OneDriveConsumer || process.env.OneDriveCommercial;
  const candidates = [
    { id: "home", label: "Ana klasör", icon: "⌂", path: home },
    { id: "desktop", label: "Masaüstü", icon: "▣", path: path.join(home, "Desktop") },
    oneDrive && { id: "onedrive-desktop", label: "OneDrive Masaüstü", icon: "▣", path: path.join(oneDrive, "Desktop") },
    { id: "documents", label: "Belgeler", icon: "▤", path: path.join(home, "Documents") },
    oneDrive && { id: "onedrive-documents", label: "OneDrive Belgeler", icon: "▤", path: path.join(oneDrive, "Documents") },
    { id: "downloads", label: "İndirilenler", icon: "↓", path: path.join(home, "Downloads") },
    { id: "project", label: "Orkestratör", icon: "◇", path: store.ROOT },
  ].filter(Boolean);
  return uniqExistingDirs(candidates);
}
function rootBrowse(message) {
  if (process.platform === "win32") {
    const drives = listDrives();
    return {
      path: "",
      parent: null,
      dirs: drives,
      drives,
      entries: drives.map((drive) => ({ name: drive, path: drive, type: "drive", modifiedAt: null })),
      places: explorerPlaces(),
      isRoot: true,
      warning: message || "",
    };
  }
  return browseDir("/", message);
}
function browseDir(p, warning = "") {
  try {
    if (!p) return rootBrowse(warning);
    const abs = path.resolve(p);
    if (!fs.statSync(abs).isDirectory()) throw new Error("Klasör değil");
    const entries = fs
      .readdirSync(abs, { withFileTypes: true })
      .filter((e) => { try { return e.isDirectory(); } catch { return false; } })
      .filter((e) => !e.name.startsWith("$") && e.name !== "System Volume Information")
      .map((e) => {
        const entryPath = path.join(abs, e.name);
        let modifiedAt = null;
        try { modifiedAt = fs.statSync(entryPath).mtime.toISOString(); } catch {}
        return { name: e.name, path: entryPath, type: "folder", modifiedAt };
      })
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    const dirs = entries.map((entry) => entry.name);
    const isDriveRoot = /^[A-Za-z]:\\?$/.test(abs);
    const up = path.dirname(abs);
    const parent = isDriveRoot ? "" : up === abs ? null : up;
    const drives = process.platform === "win32" ? listDrives() : [];
    return { path: abs, parent, dirs, drives, entries, places: explorerPlaces(), warning };
  } catch (e) {
    const requested = p ? String(p) : "";
    return rootBrowse(requested ? `"${requested}" açılamadı; bu bilgisayar gösteriliyor.` : e.message);
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
          cliStatus,
          platform: process.platform,
          workingDirAbs: path.resolve(store.ROOT, cfg.workingDir || "."),
        });
      }
      if (pathname === "/api/fs" && req.method === "GET") {
        return send(res, 200, browseDir(url.parse(req.url, true).query.path));
      }
      if (pathname === "/api/tasks" && req.method === "POST") {
        const { prompt, targetDir, operatorCli, executionMode } = await readBody(req);
        if (!prompt || !prompt.trim()) return send(res, 400, { error: "prompt gerekli" });
        const cfg = store.loadConfig();
        // Operatör, uzman agent'lardan bağımsız bir CLI'dır (claude/codex/gemini/opencode);
        // operator.md rolüyle ekibi yönetir. Belirtilmemiş/geçersizse kurulu bir CLI'ye geçilir.
        const installedCli = (name) => name && cliRegistry.DEFINITIONS[name] && cliStatus.some((c) => c.id === name && c.installed);
        let selectedCli = operatorCli || cfg.operator?.cli;
        if (!installedCli(selectedCli)) {
          if (cliRegistry.ensureValidOperator(cfg, cliStatus)) store.saveConfig(cfg);
          selectedCli = cfg.operator?.cli;
        }
        if (!installedCli(selectedCli)) {
          return send(res, 400, { error: "Kullanılabilir operatör CLI yok. Ayarlar → Operatör bölümünden kurulu bir CLI seçin (Claude/Codex/Gemini/OpenCode) ve gerekiyorsa Yeniden Tara'ya basın." });
        }
        const mode = ["auto", "fast", "balanced", "deep"].includes(executionMode) ? executionMode : "auto";
        const t = store.addTask(prompt.trim(), targetDir, selectedCli, mode);
        engine.wake();
        broadcast("queue", snapshot());
        return send(res, 200, t);
      }
      let m;
      if ((m = pathname.match(/^\/api\/tasks\/([^/]+)\/chat$/)) && req.method === "POST") {
        const found = store.findTask(m[1]);
        if (!found || found.state !== "done" || found.task.kind === "operator-chat") return send(res, 404, { error: "tamamlanmis gorev bulunamadi" });
        const { question } = await readBody(req);
        if (!question || !String(question).trim()) return send(res, 400, { error: "soru gerekli" });
        const chatTask = store.addChatTask(found.task, String(question).trim());
        if (!engine.status().running) engine.start();
        else engine.wake();
        broadcast("queue", snapshot());
        return send(res, 200, chatTask);
      }
      if ((m = pathname.match(/^\/api\/tasks\/([^/]+)\/(approve|reject)$/)) && req.method === "POST") {
        const found = store.findTask(m[1]);
        if (!found) return send(res, 404, { error: "gorev yok" });
        if (m[2] === "approve") {
          try { store.approveTask(m[1]); }
          catch (error) { return send(res, 409, { error: error.message }); }
        } else {
          try { store.rejectTask(m[1]); }
          catch (error) { return send(res, 409, { error: error.message }); }
        }
        broadcast("queue", snapshot());
        return send(res, 200, { ok: true });
      }
      if (pathname === "/api/cli/discover" && req.method === "POST") {
        cliStatus = cliRegistry.discoverInstalled();
        const cfg = store.loadConfig();
        let changed = cliRegistry.addMissingAgents(cfg, cliStatus);
        if (cliRegistry.ensureValidOperator(cfg, cliStatus)) changed = true;
        if (changed) store.saveConfig(cfg);
        return send(res, 200, { cliStatus, changed, config: cfg });
      }
      if ((m = pathname.match(/^\/api\/tasks\/([^/]+)\/events$/)) && req.method === "GET") {
        const limit = Number(url.parse(req.url, true).query.limit) || 1000;
        return send(res, 200, store.listRunEvents(m[1], Math.min(limit, 5000)));
      }
      if ((m = pathname.match(/^\/api\/tasks\/([^/]+)$/)) && req.method === "DELETE") {
        const found = store.findTask(m[1]);
        if (!found) return send(res, 404, { error: "gorev yok" });
        if (engine.status().current?.id === found.task.id) return send(res, 409, { error: "su an calisan gorev silinemez" });
        store.removeTask(found.state, found.task.id);
        broadcast("queue", snapshot());
        return send(res, 200, { ok: true });
      }
      if ((m = pathname.match(/^\/api\/tasks\/([^/]+)$/)) && req.method === "PUT") {
        const found = store.findTask(m[1]);
        if (!found) return send(res, 404, { error: "gorev yok" });
        if (found.state !== "pending") return send(res, 409, { error: "yalnizca bekleyen gorev guncellenebilir" });
        if (engine.status().current?.id === found.task.id) return send(res, 409, { error: "su an calisan gorev guncellenemez" });
        const body = await readBody(req);
        const cfg = store.loadConfig();
        const t = found.task;
        if (typeof body.prompt === "string") {
          if (!body.prompt.trim()) return send(res, 400, { error: "prompt bos olamaz" });
          t.prompt = body.prompt.trim();
        }
        if (body.executionMode && ["auto", "fast", "balanced", "deep"].includes(body.executionMode)) t.executionMode = body.executionMode;
        if (body.operatorCli) {
          if (!cliRegistry.DEFINITIONS[body.operatorCli] || !cliStatus.some((c) => c.id === body.operatorCli && c.installed)) return send(res, 400, { error: "gecersiz veya kurulu olmayan operator CLI" });
          t.operatorCli = body.operatorCli;
        }
        if (typeof body.targetDir === "string") {
          if (body.targetDir.trim()) t.targetDir = body.targetDir.trim();
          else delete t.targetDir;
        }
        // Plan yeniden uretilsin: kullanici hedefi degistirdiyse eski plan gecersizdir.
        delete t.teamState; delete t.planPreview; delete t.planHash; delete t.approved;
        store.saveTask("pending", t);
        broadcast("queue", snapshot());
        return send(res, 200, t);
      }
      if ((m = pathname.match(/^\/api\/tasks\/([^/]+)$/)) && req.method === "GET") {
        const found = store.findTask(m[1]);
        return found ? send(res, 200, found) : send(res, 404, { error: "gorev yok" });
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
        if (!cfg.agents || typeof cfg.agents !== "object") return send(res, 400, { error: "agents nesnesi gerekli" });
        if (Object.keys(cfg.agents).length < 1) return send(res, 400, { error: "operatorun altinda calisacak en az bir uzman agent gerekli" });
        if (!cfg.operator?.cli || !cliRegistry.KNOWN_CLIS.includes(cfg.operator.cli)) return send(res, 400, { error: "operator.cli gecerli bir CLI olmali (claude/codex/gemini/opencode)" });
        cfg.operator.roleFile = "roles/operator.md";
        delete cfg.operator.agent;
        for (const [name, agent] of Object.entries(cfg.agents)) {
          if (!name.trim() || !agent.cmd || typeof agent.cmd !== "string") return send(res, 400, { error: `gecersiz agent: ${name}` });
          if (!Array.isArray(agent.args)) return send(res, 400, { error: `${name}.args dizi olmali` });
        }
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

function openBrowser(target) {
  if (process.env.OPEN === "0" || process.env.NO_OPEN) return;
  const { spawn } = require("child_process");
  const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", target] : [target];
  try { spawn(cmd, args, { stdio: "ignore", detached: true, windowsHide: true }).unref(); } catch {}
}

function startupBanner() {
  const G = "\x1b[32m", Y = "\x1b[33m", DIM = "\x1b[90m", B = "\x1b[1m", C = "\x1b[36m", X = "\x1b[0m";
  const installed = cliStatus.filter((c) => c.installed);
  const cfg = store.loadConfig();
  const url = `http://${HOST}:${PORT}`;
  console.log(`\n  ${B}${C}CLI Team Command Center${X}`);
  console.log(`  ${DIM}operatör-liderliğinde çok-agent orkestratörü${X}\n`);
  const cliLine = cliStatus.map((c) => `${c.installed ? G + "●" : DIM + "○"} ${c.id}${X}`).join("   ");
  console.log(`  CLI:      ${cliLine}`);
  console.log(`  Operatör: ${cfg.operator?.cli || DIM + "(seçilemedi)" + X}   ${DIM}·${X}   Uzman: ${Object.values(cfg.agents).filter((a) => a.enabled !== false).length}`);
  if (!installed.length) {
    console.log(`\n  ${Y}⚠ Hiçbir CLI kurulu değil.${X} Codex / Claude / Gemini / OpenCode'dan en az birini kurun.`);
    console.log(`    ${DIM}Ayrıntı için:  npm run doctor${X}`);
  }
  console.log(`\n  ${B}▶ Panel:  ${C}${url}${X}`);
  console.log(`  ${DIM}Panelde 'Başlat'a basıp bir görev gönderin. (tarayıcı otomatik açılmazsa yukarıdaki adresi açın)${X}\n`);
  openBrowser(url);
}

server.listen(PORT, HOST, startupBanner);
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  \x1b[31m✗ ${HOST}:${PORT} kullanımda.\x1b[0m Farklı port ile deneyin:  \x1b[1mPORT=4318 npm start\x1b[0m\n`);
    process.exit(1);
  }
  throw err;
});
