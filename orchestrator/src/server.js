// server.js — saf Node http sunucusu: REST API + SSE + statik web paneli
// libuv threadpool'u genislet: bir kac donuk ag/eslesmis surucudeki bloklayan fs.stat
// cagrisi (Gozat klasor gezgini) varsayilan 4 thread'i tuketip mesru fs islerini ac
// birakmasin. Ilk async fs kullanimindan ONCE ayarlanmali; bu yuzden en ust satirda.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || "32";
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const url = require("url");
const store = require("./store");
const engine = require("./engine");
const cliRegistry = require("./cli-registry");
const skillRegistry = require("./skill-registry");
const checkpoints = require("./checkpoints");

// Guvenlik agi: tek bir stray hata (or. kopuk ag surucusu, bir istek isleyicisindeki
// beklenmeyen throw) TUM sunucuyu oldurmesin. Logla, ayakta kal.
process.on("uncaughtException", (e) => console.error("[uncaughtException]", (e && e.stack) || e));
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", (e && e.stack) || e));

const PORT = process.env.PORT || 4317;
const HOST = process.env.HOST || "127.0.0.1";
const WEB = path.join(store.ROOT, "web");
const HEALTH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const HEALTH_CACHE_VERSION = 2;
const CODEX_MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
let codexModelRefreshDue = false;
let codexModelCache = { checkedAt: 0, models: [] };

store.ensureDirs();
let cliStatus = cliRegistry.discoverInstalled();
{
  const cfg = store.loadConfig();
  const savedModels = cfg.codexModelCache && typeof cfg.codexModelCache === "object" ? cfg.codexModelCache : {};
  const startupCount = Number(savedModels.startupCount || 0) + 1;
  codexModelCache = {
    checkedAt: Date.parse(savedModels.checkedAt || "") || 0,
    models: Array.isArray(savedModels.models) ? savedModels.models : [],
  };
  codexModelRefreshDue = !codexModelCache.models.length || startupCount % 10 === 0;
  cfg.codexModelCache = { ...savedModels, startupCount, lastStartedAt: new Date().toISOString() };
  const healthCacheValid = cfg.cliHealthCache?.version === HEALTH_CACHE_VERSION;
  const cached = healthCacheValid ? cfg.cliHealthCache?.results : null;
  let staleHealthCleared = false;
  if (cached && typeof cached === "object") {
    cliStatus = cliStatus.map((cli) => cached[cli.id] ? { ...cli, health: cached[cli.id] } : cli);
  } else {
    for (const agent of Object.values(cfg.agents || {})) {
      if (agent.health) { delete agent.health; staleHealthCleared = true; }
    }
  }
  let changed = cliRegistry.addMissingAgents(cfg, cliStatus);
  if (cliRegistry.ensureValidOperator(cfg, cliStatus)) changed = true;
  if (changed || staleHealthCleared || JSON.stringify(savedModels) !== JSON.stringify(cfg.codexModelCache)) store.saveConfig(cfg);
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
engine.on("filechange", (d) => broadcast("filechange", d));
engine.on("queue", () => broadcast("queue", snapshot()));

function snapshot() {
  return {
    pending: store.listTasks("pending"),
    approval: store.listTasks("approval"),
    done: store.listTasks("done").filter((task) => task.kind !== "operator-chat").slice(-30).reverse(),
    failed: store.listTasks("failed").slice(-30).reverse(),
  };
}

function applyHealthToConfig(results) {
  const cfg = store.loadConfig();
  let changed = false;
  const cachedResults = {};
  for (const result of results) {
    cachedResults[result.id] = result.health || { status: "unknown", label: "Bilinmiyor", detail: "" };
    for (const agent of Object.values(cfg.agents || {})) {
      if ((agent.adapter || cliRegistry.adapterId(agent.cmd)) !== result.id) continue;
      const next = result.health || { status: "unknown", label: "Bilinmiyor", detail: "" };
      if (JSON.stringify(agent.health || {}) !== JSON.stringify(next)) {
        agent.health = next;
        changed = true;
      }
    }
  }
  const nextCache = { version: HEALTH_CACHE_VERSION, checkedAt: new Date().toISOString(), results: cachedResults };
  if (JSON.stringify(cfg.cliHealthCache || {}) !== JSON.stringify(nextCache)) {
    cfg.cliHealthCache = nextCache;
    changed = true;
  }
  if (changed) store.saveConfig(cfg);
  return cfg;
}

let healthRunning = false;
async function getCodexModels(force = false) {
  if (!force && codexModelCache.models.length && Date.now() - codexModelCache.checkedAt < CODEX_MODEL_CACHE_TTL_MS) return codexModelCache.models;
  const models = await cliRegistry.listCodexModels({ timeoutMs: 20000 });
  codexModelCache = { checkedAt: Date.now(), models };
  const cfg = store.loadConfig();
  cfg.codexModelCache = { ...(cfg.codexModelCache || {}), checkedAt: new Date().toISOString(), models };
  store.saveConfig(cfg);
  return models;
}
async function refreshCliHealth(force = false) {
  if (healthRunning) return cliStatus;
  const cfg = store.loadConfig();
  const cachedAt = Date.parse(cfg.cliHealthCache?.checkedAt || "");
  if (!force && cfg.cliHealthCache?.version === HEALTH_CACHE_VERSION && Number.isFinite(cachedAt) && Date.now() - cachedAt < HEALTH_CACHE_TTL_MS) {
    broadcast("cli-health", cliStatus);
    return cliStatus;
  }
  healthRunning = true;
  cliStatus = cliStatus.map((cli) => ({ ...cli, health: { status: "testing", label: "Test ediliyor", detail: "Gerçek CLI sağlık testi çalışıyor." } }));
  broadcast("cli-health", cliStatus);
  try {
    cliStatus = await cliRegistry.healthCheckAll(cliStatus, { timeoutMs: 45000, cfg });
    applyHealthToConfig(cliStatus);
    broadcast("cli-health", cliStatus);
    return cliStatus;
  } finally {
    healthRunning = false;
  }
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

// ---- Klasor gezgini (async + timeout) ----
// ONEMLI: eskiden statSync/readdirSync kullaniliyordu. Kopuk bir AG/eslesmis surucu
// (or. dead SMB share) statSync'te saniyelerce blokladigi icin TEK is parcacikli sunucu
// tamamen kitleniyordu (Gozat "acilmiyor"/donuyor). Artik tum FS erisimi async ve her
// cagri kisa bir timeout'a yaristirilir; donuk surucu bloklamaz, atlanir.
let driveCache = { at: 0, value: [] };
function statSafe(p, ms = 700) {
  return Promise.race([
    fs.promises.stat(p).catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
async function uniqExistingDirs(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item.path || seen.has(item.path.toLowerCase())) continue;
    seen.add(item.path.toLowerCase());
    const st = await statSafe(item.path);
    if (st && st.isDirectory()) out.push(item);
  }
  return out;
}
async function listDrives() {
  if (Date.now() - driveCache.at < 30000) return driveCache.value.slice();
  const found = new Set();
  for (const d of [process.env.SystemDrive, process.env.HOMEDRIVE]) {
    if (d) found.add(path.parse(d).root || `${d.replace(/[\\/]$/, "")}\\`);
  }
  // Tum surucu harflerini PARALEL yokla; donuk surucu 700ms sonra atlanir (bloklamaz).
  const results = await Promise.all(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(async (c) => {
      const d = c + ":\\";
      const st = await statSafe(d, 700);
      return st && st.isDirectory() ? d : null;
    })
  );
  for (const d of results) if (d) found.add(d);
  const drives = [...found].sort((a, b) => a.localeCompare(b));
  driveCache = { at: Date.now(), value: drives };
  return drives.slice();
}
async function explorerPlaces() {
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
async function rootBrowse(message) {
  if (process.platform === "win32") {
    const drives = await listDrives();
    return {
      path: "",
      parent: null,
      dirs: drives,
      drives,
      entries: drives.map((drive) => ({ name: drive, path: drive, type: "drive", modifiedAt: null })),
      places: await explorerPlaces(),
      isRoot: true,
      warning: message || "",
    };
  }
  return browseDir("/", message);
}
async function browseDir(p, warning = "") {
  try {
    if (!p) return await rootBrowse(warning);
    const abs = path.resolve(p);
    const rootStat = await statSafe(abs, 2000);
    if (!rootStat || !rootStat.isDirectory()) throw new Error("Klasör değil");
    const dirents = await fs.promises.readdir(abs, { withFileTypes: true });
    const wanted = dirents.filter((e) => {
      let isDir = false;
      try { isDir = e.isDirectory(); } catch { isDir = false; }
      return isDir && !e.name.startsWith("$") && e.name !== "System Volume Information";
    });
    // mtime'lari PARALEL topla; donuk bir alt klasor 400ms sonra tarihsiz gecer.
    const entries = await Promise.all(
      wanted.map(async (e) => {
        const entryPath = path.join(abs, e.name);
        const st = await statSafe(entryPath, 400);
        let modifiedAt = null;
        if (st) { try { modifiedAt = st.mtime.toISOString(); } catch {} }
        return { name: e.name, path: entryPath, type: "folder", modifiedAt };
      })
    );
    entries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    const dirs = entries.map((entry) => entry.name);
    const isDriveRoot = /^[A-Za-z]:\\?$/.test(abs);
    const up = path.dirname(abs);
    const parent = isDriveRoot ? "" : up === abs ? null : up;
    const drives = process.platform === "win32" ? await listDrives() : [];
    return { path: abs, parent, dirs, drives, entries, places: await explorerPlaces(), warning };
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
          skills: skillRegistry.allSkills().map((s) => ({ name: s.name, file: s.file, description: s.description, category: s.category, appliesTo: s.appliesTo, match: s.match })),
          cliStatus,
          platform: process.platform,
          workingDirAbs: path.resolve(store.ROOT, cfg.workingDir || "."),
        });
      }
      if (pathname === "/api/security/autonomous-consent" && req.method === "POST") {
        const { accepted } = await readBody(req);
        if (accepted !== true) return send(res, 400, { error: "Acik kabul gerekli." });
        const cfg = store.loadConfig();
        cfg.autonomousConsentAcceptedAt = cfg.autonomousConsentAcceptedAt || new Date().toISOString();
        store.saveConfig(cfg);
        return send(res, 200, { accepted: true, acceptedAt: cfg.autonomousConsentAcceptedAt });
      }
      if (pathname === "/api/fs" && req.method === "GET") {
        return send(res, 200, await browseDir(url.parse(req.url, true).query.path));
      }
      if (pathname === "/api/tasks" && req.method === "POST") {
        const { prompt, targetDir, operatorCli, executionMode } = await readBody(req);
        if (!prompt || !prompt.trim()) return send(res, 400, { error: "prompt gerekli" });
        const cfg = store.loadConfig();
        // Operatör, uzman agent'lardan bağımsız bir CLI'dır (claude/codex/gemini/opencode);
        // operator.md rolüyle ekibi yönetir. Belirtilmemiş/geçersizse kurulu bir CLI'ye geçilir.
        const cliEntry = (name) => cliStatus.find((c) => c.id === name);
        const installedCli = (name) => name && cliRegistry.DEFINITIONS[name] && cliStatus.some((c) => c.id === name && c.installed
          && (name !== "opencode" || c.ready !== false || Boolean(cfg.cliSettings?.opencode?.model)));
        const usableCli = (name) => {
          const entry = cliEntry(name);
          return installedCli(name) && (!entry?.health || entry.health.status === "ready");
        };
        let selectedCli = operatorCli || cfg.operator?.cli;
        if (!installedCli(selectedCli)) {
          if (cliRegistry.ensureValidOperator(cfg, cliStatus)) store.saveConfig(cfg);
          selectedCli = cfg.operator?.cli;
        }
        if (!installedCli(selectedCli)) {
          return send(res, 400, { error: "Kullanılabilir operatör CLI yok. Ayarlar → Operatör bölümünden kurulu bir CLI seçin (Claude/Codex/Gemini/OpenCode) ve gerekiyorsa Yeniden Tara'ya basın." });
        }
        if (!usableCli(selectedCli)) {
          const health = cliEntry(selectedCli)?.health;
          return send(res, 409, { error: `${cliRegistry.DEFINITIONS[selectedCli].description} şu anda kullanılabilir değil: ${health?.label || "sağlık testi bekleniyor"}. ${health?.detail || "Önce model sağlık testini tamamlayın."}` });
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
      if ((m = pathname.match(/^\/api\/tasks\/([^/]+)\/restore$/)) && req.method === "POST") {
        const found = store.findTask(m[1]);
        if (!found) return send(res, 404, { error: "gorev yok" });
        if (engine.status().current) return send(res, 409, { error: "Motor bir gorev calistirirken surum geri yuklenemez; once durdurun." });
        if (!found.task.checkpointId) return send(res, 400, { error: "Bu gorev icin kayitli bir surum yok." });
        const cfg = store.loadConfig();
        const result = checkpoints.restoreCheckpoint(found.task.checkpointId, { retention: cfg.versioningRetention });
        if (!result.ok) return send(res, 409, { error: result.error || "Surum geri yuklenemedi." });
        broadcast("log", { at: new Date().toISOString(), type: "log", taskId: found.task.id, level: "warn", msg: `Surum geri yuklendi (${found.task.id} oncesi): ${result.restored} dosya geri yazildi, ${result.deleted} sonradan olusan dosya silindi. Geri almayi geri almak icin redo surumu: ${result.redoId || "yok"}.` });
        broadcast("queue", snapshot());
        return send(res, 200, result);
      }
      if (pathname === "/api/checkpoints" && req.method === "GET") {
        const dir = url.parse(req.url, true).query.dir;
        return send(res, 200, checkpoints.listCheckpoints(dir ? path.resolve(store.ROOT, dir) : undefined));
      }
      if (pathname === "/api/cli/discover" && req.method === "POST") {
        cliStatus = cliRegistry.discoverInstalled();
        const cfg = store.loadConfig();
        const body = await readBody(req);
        if (Array.isArray(body.ignoredAdapters)) {
          cfg.discoveryIgnoredAdapters = [...new Set(body.ignoredAdapters.filter((id) => cliRegistry.KNOWN_CLIS.includes(id)))];
        }
        let changed = cliRegistry.addMissingAgents(cfg, cliStatus);
        if (cliRegistry.ensureValidOperator(cfg, cliStatus)) changed = true;
        if (changed || Array.isArray(body.ignoredAdapters)) store.saveConfig(cfg);
        await refreshCliHealth(true);
        return send(res, 200, { cliStatus, changed, config: store.loadConfig() });
      }
      if (pathname === "/api/cli/health" && req.method === "POST") {
        await refreshCliHealth(true);
        return send(res, 200, { cliStatus, config: store.loadConfig() });
      }
      if (pathname === "/api/codex/models" && req.method === "GET") {
        try { return send(res, 200, { models: await getCodexModels(false) }); }
        catch (error) { return send(res, 502, { error: `Codex modelleri alınamadı: ${error.message}` }); }
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
        if (action === "start") {
          if (!store.loadConfig().autonomousConsentAcceptedAt) return send(res, 409, { error: "Otonom CLI kosullarini once onaylayin.", code: "AUTONOMOUS_CONSENT_REQUIRED" });
          engine.start();
        }
        if (action === "stop") engine.stop();
        return send(res, 200, engine.status());
      }
      if (pathname === "/api/config" && req.method === "GET") {
        return send(res, 200, store.loadConfig());
      }
      if (pathname === "/api/config" && req.method === "PUT") {
        let cfg = await readBody(req);
        if (!cfg.agents || typeof cfg.agents !== "object") return send(res, 400, { error: "agents nesnesi gerekli" });
        if (Object.keys(cfg.agents).length < 1) return send(res, 400, { error: "operatorun altinda calisacak en az bir uzman agent gerekli" });
        if (!cfg.operator?.cli || !cliRegistry.KNOWN_CLIS.includes(cfg.operator.cli)) return send(res, 400, { error: "operator.cli gecerli bir CLI olmali (claude/codex/gemini/opencode)" });
        cfg.operator.roleFile = "roles/operator.md";
        delete cfg.operator.agent;
        // Eski UI govdeleri (operator.codexSettings / operator.model) yeni cliSettings
        // yapisina tasinir; dogrulama tek semada yapilir.
        cfg = store.normalizeConfig(cfg);
        cliRegistry.normalizeAgentAdapters(cfg);
        if (cfg.cliSettings.codex.reasoningEffort && !["low", "medium", "high", "xhigh", "max", "ultra"].includes(cfg.cliSettings.codex.reasoningEffort)) return send(res, 400, { error: "cliSettings.codex.reasoningEffort gecersiz" });
        if (cfg.cliSettings.codex.serviceTier && !/^[A-Za-z0-9._-]{1,64}$/.test(cfg.cliSettings.codex.serviceTier)) return send(res, 400, { error: "cliSettings.codex.serviceTier gecersiz" });
        for (const id of ["codex", "opencode"]) {
          if (cfg.cliSettings[id].model != null && typeof cfg.cliSettings[id].model !== "string") return send(res, 400, { error: `cliSettings.${id}.model metin olmali` });
        }
        if (cfg.skills !== undefined) {
          if (typeof cfg.skills !== "object" || cfg.skills === null) return send(res, 400, { error: "skills nesne olmali" });
          if (cfg.skills.enabled !== undefined && (!Array.isArray(cfg.skills.enabled) || cfg.skills.enabled.some((x) => typeof x !== "string"))) return send(res, 400, { error: "skills.enabled metin dizisi olmali" });
          if (cfg.skills.charBudget !== undefined && (typeof cfg.skills.charBudget !== "number" || !Number.isFinite(cfg.skills.charBudget) || cfg.skills.charBudget < 200)) return send(res, 400, { error: "skills.charBudget en az 200 olmali" });
          if (cfg.skills.referenceCharBudget !== undefined && (typeof cfg.skills.referenceCharBudget !== "number" || !Number.isFinite(cfg.skills.referenceCharBudget) || cfg.skills.referenceCharBudget < 300)) return send(res, 400, { error: "skills.referenceCharBudget en az 300 olmali" });
          for (const key of ["catalogLimit", "maxSkillsPerAssignment"]) {
            if (cfg.skills[key] !== undefined && (!Number.isInteger(cfg.skills[key]) || cfg.skills[key] < 1)) return send(res, 400, { error: `skills.${key} pozitif tam sayi olmali` });
          }
          if (cfg.skills.autoMatch !== undefined && typeof cfg.skills.autoMatch !== "boolean") return send(res, 400, { error: "skills.autoMatch boolean olmali" });
        }
        for (const [name, agent] of Object.entries(cfg.agents)) {
          if (!name.trim() || !agent.cmd || typeof agent.cmd !== "string") return send(res, 400, { error: `gecersiz agent: ${name}` });
          if (!Array.isArray(agent.args)) return send(res, 400, { error: `${name}.args dizi olmali` });
        }
        store.saveConfig(cfg);
        broadcast("status", engine.status());
        return send(res, 200, { ok: true });
      }
      if (pathname === "/api/skills" && req.method === "GET") {
        return send(res, 200, { skills: skillRegistry.allSkills().map((s) => ({ name: s.name, file: s.file, description: s.description, category: s.category, appliesTo: s.appliesTo, match: s.match })) });
      }
      if ((m = pathname.match(/^\/api\/skills\/(.+)$/))) {
        let file = decodeURIComponent(m[1]);
        if (!file.endsWith(".md")) file += ".md";
        if (path.basename(file) !== file) return send(res, 400, { error: "gecersiz beceri adi" });
        if (req.method === "GET") return send(res, 200, { file, content: skillRegistry.readRaw(file) });
        if (req.method === "PUT") {
          const { content } = await readBody(req);
          const validation = skillRegistry.validateSkill(file, content || "");
          if (!validation.ok) return send(res, 400, { error: validation.errors.join("; ") });
          const saved = skillRegistry.writeSkill(file, content);
          return send(res, 200, { ok: true, file: saved });
        }
        if (req.method === "DELETE") {
          // Silmeden once beceri adini coz; etkin liste dosya adini degil frontmatter `name`i tutar.
          const existing = skillRegistry.loadSkill(file);
          const names = new Set([file.replace(/\.md$/i, ""), existing?.name].filter(Boolean));
          skillRegistry.deleteSkill(file);
          const cfg = store.loadConfig();
          if (Array.isArray(cfg.skills?.enabled) && cfg.skills.enabled.some((name) => names.has(name))) {
            cfg.skills.enabled = cfg.skills.enabled.filter((name) => !names.has(name));
            store.saveConfig(cfg);
          }
          return send(res, 200, { ok: true });
        }
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
  console.log(`\n  ${B}${C}CrewCtl${X}`);
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
setImmediate(() => refreshCliHealth(false).catch((err) => console.error("CLI sağlık testi başlatılamadı:", err.message)));
setImmediate(() => {
  if (codexModelRefreshDue) getCodexModels(true).catch((err) => console.error("Codex model kataloğu yenilenemedi:", err.message));
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  \x1b[31m✗ ${HOST}:${PORT} kullanımda.\x1b[0m Farklı port ile deneyin:  \x1b[1mPORT=4318 npm start\x1b[0m\n`);
    process.exit(1);
  }
  throw err;
});
