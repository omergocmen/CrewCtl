// store.js — dosya tabanli kuyruk, config, hafiza, butce (sifir bagimlilik)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const isWin = process.platform === "win32";
// ASSETS: paket dizini (salt-okunur varlıklar: web/, config.default.json, varsayilan roles/+skills/).
// __dirname/.. daima paketin gercek yeridir (npm global/npx onbellegi dahil).
const ASSETS = path.join(__dirname, "..");
// ROOT: yazilabilir VERI koku (config.json, queue/, state/, memory/, kullanicinin roles/+skills/).
// Oncelik: CLI_TEAM_ROOT (izole test/CI) > CREWCTL_HOME (kullanici override) > mod tespiti.
// Gelistirme kopyasinda test/ klasoru bulunur ve paket dizini yazilabilirdir; o zaman ROOT=ASSETS
// (mevcut npm start/npm test davranisi aynen korunur). Yayinlanan pakette test/ gonderilmez, bu
// yuzden kurulu modda veri ~/.crewctl'e yazilir (npm onbelleğine degil).
const isDevCheckout = fs.existsSync(path.join(ASSETS, "test"));
const ROOT = path.resolve(
  process.env.CLI_TEAM_ROOT ||
  process.env.CREWCTL_HOME ||
  (isDevCheckout ? ASSETS : path.join(os.homedir(), ".crewctl"))
);
// WORK_BASE: agent'larin uzerinde calisacagi klasorun goreli cozumleme tabani. Kurulu modda
// kullanici komutu nerede calistirdiysa orasidir (cwd); mutlak yol secilirse zaten o kullanilir.
const WORK_BASE = process.cwd();
const Q = path.join(ROOT, "queue");
const STATES = ["pending", "done", "failed", "approval"];
const MEM = path.join(ROOT, "memory");
const STATE = path.join(ROOT, "state");
const EVENTS = path.join(STATE, "events");
const ROLES = path.join(ROOT, "roles");
const SKILLS = path.join(ROOT, "skills");

// Windows'ta rename/unlink; antivirus, arama dizinleyici veya kuyrugu ayni anda tarayan
// canli sunucu dosyada kisa sureli bir handle tuttugunda gecici olarak EPERM/EACCES/EBUSY
// verir. Tek seferlik cagri bu durumda tum gorevi coldururdu; kisa artan beklemelerle yeniden
// deneriz. Bu kod yolu tum saveTask/saveConfig/addTask cagrilarinin sicak yolu.
const TRANSIENT_FS_CODES = new Set(["EPERM", "EACCES", "EBUSY", "ENOENT", "EEXIST"]);
function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {}
}
function isTransientFsError(error) {
  return isWin && error && TRANSIENT_FS_CODES.has(error.code);
}

function sweepStaleTemp(dir, maxAgeMs = 5 * 60 * 1000) {
  // Kalici olarak yeniden adlandirilamamis eski .tmp dosyalarini birak birikmesin diye temizle.
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return; }
  const now = Date.now();
  for (const name of entries) {
    if (!name.endsWith(".tmp")) continue;
    const full = path.join(dir, name);
    try {
      if (now - fs.statSync(full).mtimeMs > maxAgeMs) fs.rmSync(full, { force: true });
    } catch {}
  }
}

// Kurulu modda (ROOT != ASSETS) veri kokundeki roles/ ve skills/ bos ise paketle gelen
// varsayilanlari BIR KEZ kopyala. Kullanicinin duzenlemeleri korunur (yalnizca bos dizine seed).
let seededAssets = false;
function seedDefaults() {
  if (seededAssets) return;
  seededAssets = true;
  if (ROOT === ASSETS) return;
  for (const [srcDir, dstDir] of [[path.join(ASSETS, "roles"), ROLES], [path.join(ASSETS, "skills"), SKILLS]]) {
    try {
      const existing = fs.existsSync(dstDir) ? fs.readdirSync(dstDir).filter((f) => f.toLowerCase().endsWith(".md")) : [];
      if (existing.length) continue;
      const defaults = fs.existsSync(srcDir) ? fs.readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith(".md")) : [];
      for (const f of defaults) fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
    } catch {}
  }
}

// ensureDirs, olay akisinda cok sik cagrilir; temizligi dakikada bir defayla sinirla ki
// her stdout parcasinda dizin taramasi yapmayalim.
let lastSweepAt = 0;
function ensureDirs() {
  const dirs = [...STATES.map((s) => path.join(Q, s)), MEM, STATE, EVENTS, ROLES, SKILLS];
  dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));
  seedDefaults();
  if (Date.now() - lastSweepAt > 60 * 1000) {
    lastSweepAt = Date.now();
    for (const s of STATES) sweepStaleTemp(path.join(Q, s));
  }
}

// Atomik yazma: once .tmp'ye yaz, sonra rename et. Rename ayni disk uzerinde atomiktir;
// boylece surec ortasinda cokme olsa bile yarim/bozuk JSON dosyasi kalmaz (her PC'de guvenli).
// Windows'ta rename gecici olarak kilitlenebildigi icin (bkz. TRANSIENT_FS_CODES) yeniden dener.
function atomicWrite(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.writeFileSync(tmp, data);
  let lastError;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientFsError(error)) break;
      sleepSync(20 * (attempt + 1));
    }
  }
  // Rename kalici olarak basarisiz. Gorevi tamamen kaybetmektense hedefe dogrudan (atomik
  // olmayan) yazmayi son care olarak dene; sonra gecici dosyayi temizle.
  try {
    fs.writeFileSync(file, data);
    try { fs.rmSync(tmp, { force: true }); } catch {}
    return;
  } catch {}
  try { fs.rmSync(tmp, { force: true }); } catch {}
  throw lastError;
}

// ---- Config ----
// Minimal geri-donus varsayilani (config.default.json de yoksa kullanilir) — sistem her
// zaman calisir durumda acilsin diye.
const FALLBACK_CONFIG = {
  approvalMode: "auto", workingDir: "..", dailyCallBudget: 150,
  autonomousConsentAcceptedAt: null,
  pollSeconds: 15, memoryCharBudget: 8000, teamContextCharBudget: 30000, agentTimeoutSeconds: 900,
  cliSilenceTimeoutSeconds: 300,
  discoveryIgnoredAdapters: [],
  liveDiff: true, liveDiffIntervalMs: 2500,
  versioning: true, versioningRetention: 20,
  // Ajan hapsi: "workspace" = her CLI'nin native sandbox'i ile calisma klasoru DISINA yazma/ag
  // engellenir (Docker/Git gerektirmez; codex mac/Linux/Windows'ta OS-native zorlar). "off" =
  // eski davranis. extraWritableDirs: calisma klasoru disinda ek yazilabilir mutlak yollar.
  sandbox: { mode: "workspace", extraWritableDirs: [] },
  // Proje context: her calisma klasorunun .crewctl/CONTEXT.md profili gorev acilisinda yuklenir,
  // bitiminde operator revize eder. false = eski global hafiza davranisi.
  projectContext: true, projectContextCharBudget: 6000,
  notify: { webhookUrl: "", onComplete: true, onFailed: true },
  operator: { roleFile: "roles/operator.md", maxRounds: 6, maxDelegationsPerRound: 8, maxInfrastructureRecoveryRounds: 2, protocolRetries: 1 },
  cliSettings: {
    codex: { model: "", reasoningEffort: "medium", serviceTier: "fast" },
    opencode: { model: "" },
  },
  skills: { enabled: [], autoMatch: true, catalogLimit: 12, maxSkillsPerAssignment: 3, charBudget: 2400, referenceCharBudget: 1200 },
  agents: {}, riskyPatterns: [], schedules: [],
};
// Eski sema, model ayarlarini operator altina gomuyordu (operator.codexSettings ve
// operator.model). Yeni sema CLI bazlidir: cliSettings[adapter] o CLI'nin operator ve
// uzman kullanimlarinin tumune uygulanir. Saf ve idempotent olmali; loadConfig sicak yoldur.
function normalizeConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return cfg;
  const current = cfg.cliSettings && typeof cfg.cliSettings === "object" ? cfg.cliSettings : {};
  const legacyCodex = cfg.operator && typeof cfg.operator.codexSettings === "object" ? cfg.operator.codexSettings : {};
  const legacyOpenCodeModel = typeof cfg.operator?.model === "string" ? cfg.operator.model : "";
  const normalized = {
    ...cfg,
    skills: { enabled: [], autoMatch: true, catalogLimit: 12, maxSkillsPerAssignment: 3, charBudget: 2400, referenceCharBudget: 1200, ...(cfg.skills || {}) },
    schedules: Array.isArray(cfg.schedules) ? cfg.schedules : [],
    // Her yuklemede hapis semasini garanti et; boylece eski config.json'lar yukseltilince
    // varsayilan olarak "workspace" hapsini kazanir. Gecersiz mode "workspace"e duser.
    sandbox: {
      mode: ["off", "workspace"].includes(cfg.sandbox?.mode) ? cfg.sandbox.mode : "workspace",
      extraWritableDirs: Array.isArray(cfg.sandbox?.extraWritableDirs)
        ? cfg.sandbox.extraWritableDirs.filter((x) => typeof x === "string" && x.trim()).map(String)
        : [],
    },
    cliSettings: {
      codex: { model: "", reasoningEffort: "medium", serviceTier: "fast", ...legacyCodex, ...(current.codex || {}) },
      opencode: { model: legacyOpenCodeModel, ...(current.opencode || {}) },
    },
  };
  if (cfg.operator && typeof cfg.operator === "object") {
    normalized.operator = { ...cfg.operator };
    delete normalized.operator.codexSettings;
    delete normalized.operator.model;
  }
  return normalized;
}
// config.json kisiye ozeldir (gitignore). Yoksa config.default.json sablonundan uretilir;
// boylece kullanici klonlayip `npm start` dedigi anda calisir ve kurulu CLI'lar keşifle eklenir.
// Paketle gelen beceri dosyalarinin slug'lari (dosya adi = frontmatter name, dogrulanir).
// Ilk config uretiminde beceriler VARSAYILAN OLARAK ETKIN gelsin diye kullanilir; boylece
// operator, kullanicinin becerilerini kodlama/planlama/review delegasyonlarinda kullanabilir.
function shippedSkillSlugs() {
  try {
    return fs.readdirSync(path.join(ASSETS, "skills"))
      .filter((f) => f.toLowerCase().endsWith(".md"))
      .map((f) => f.replace(/\.md$/i, ""));
  } catch { return []; }
}
function loadConfig() {
  const file = path.join(ROOT, "config.json");
  if (!fs.existsSync(file)) {
    const template = path.join(ASSETS, "config.default.json");
    const seed = fs.existsSync(template) ? fs.readFileSync(template, "utf8") : JSON.stringify(FALLBACK_CONFIG, null, 2);
    let seedObj;
    try { seedObj = JSON.parse(seed); } catch { seedObj = { ...FALLBACK_CONFIG }; }
    // Ilk kurulumda tum paket becerilerini etkinlestir (kullanici Ayarlar'dan kapatabilir).
    // Sonraki yuklemelerde dosya var oldugundan bu blok CALISMAZ; kullanicinin secimi korunur.
    seedObj.skills = seedObj.skills || {};
    if (!Array.isArray(seedObj.skills.enabled) || !seedObj.skills.enabled.length) {
      const slugs = shippedSkillSlugs();
      if (slugs.length) seedObj.skills.enabled = slugs;
    }
    atomicWrite(file, JSON.stringify(seedObj, null, 2));
  }
  return normalizeConfig(JSON.parse(fs.readFileSync(file, "utf8")));
}
function saveConfig(cfg) {
  atomicWrite(path.join(ROOT, "config.json"), JSON.stringify(cfg, null, 2));
}

// ---- Roller ----
function listRoles() {
  if (!fs.existsSync(ROLES)) return [];
  return fs.readdirSync(ROLES).filter((f) => f.endsWith(".md"));
}
function readRole(file) {
  const p = path.join(ROLES, path.basename(file));
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}
function writeRole(file, content) {
  fs.writeFileSync(path.join(ROLES, path.basename(file)), content);
}
function deleteRole(file) {
  const p = path.join(ROLES, path.basename(file));
  if (fs.existsSync(p)) fs.rmSync(p);
}

// ---- Gorevler ----
function taskPath(state, id) {
  return path.join(Q, state, `${id}.json`);
}
function listTasks(state) {
  const dir = path.join(Q, state);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}
// Yalnizca en yeni `limit` gorevi okur. Gorev id'si zaman damgasiyla basladigi icin dosya adi
// siralamasi = kronolojik siralama; boylece done/failed gecmisi buyudukce (yuzlerce/binlerce
// dosya) her pano yenilemesinde TUM dosyalari okuyup ayristirma maliyeti sabit N'e iner.
function listRecentTasks(state, limit) {
  const dir = path.join(Q, state);
  if (!fs.existsSync(dir)) return [];
  let names = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (limit && names.length > limit) names = names.slice(-limit);
  return names
    .map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; }
    })
    .filter(Boolean);
}
function nextPending() {
  return listTasks("pending")[0] || null;
}
function addTask(prompt, targetDir, operatorCli, executionMode) {
  const id =
    new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 15) +
    "-" +
    Math.floor(Math.random() * 9000 + 1000);
  const task = { id, prompt, status: "pending", createdAt: new Date().toISOString() };
  if (targetDir) task.targetDir = targetDir;
  if (operatorCli) task.operatorCli = operatorCli;
  if (executionMode) task.executionMode = executionMode;
  atomicWrite(taskPath("pending", id), JSON.stringify(task, null, 2));
  return task;
}
function addChatTask(parentTask, question) {
  const task = addTask(question, parentTask.targetDir, parentTask.operatorCli, "chat");
  task.kind = "operator-chat";
  task.parentTaskId = parentTask.id;
  saveTask("pending", task);
  return task;
}
// Zamanlanmis bir gorevi kuyruga ekler. Normal gorevle ayni yolu kullanir; yalnizca kaynagini
// isaretlemek icin scheduleId iliştirir (Pano bu görevi "zamanlanmis" rozetiyle gosterebilsin).
function addScheduledTask(schedule) {
  const task = addTask(schedule.prompt, schedule.targetDir, schedule.operatorCli, schedule.executionMode || "auto");
  task.scheduleId = schedule.id;
  saveTask("pending", task);
  return task;
}

// ---- Kalici calisma olaylari ----
function appendRunEvent(taskId, event) {
  ensureDirs();
  fs.appendFileSync(path.join(EVENTS, `${path.basename(taskId)}.jsonl`), JSON.stringify(event) + "\n");
}
function listRunEvents(taskId, limit = 1000) {
  const file = path.join(EVENTS, `${path.basename(taskId)}.jsonl`);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).slice(-Math.max(1, limit)).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}
function hashText(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}
function saveTask(state, task) {
  atomicWrite(taskPath(state, task.id), JSON.stringify(task, null, 2));
}
function findTask(id) {
  for (const s of STATES) {
    const p = taskPath(s, id);
    if (fs.existsSync(p)) return { state: s, task: JSON.parse(fs.readFileSync(p, "utf8")) };
  }
  return null;
}
function moveTask(fromState, toState, task) {
  const src = taskPath(fromState, task.id);
  // Hedefi once atomik olarak yaz. Surec iki islem arasinda cokse bile gorev kaybolmaz.
  saveTask(toState, task);
  if (fromState !== toState && fs.existsSync(src)) fs.rmSync(src);
}
function removeTask(state, id) {
  const p = taskPath(state, id);
  if (fs.existsSync(p)) fs.rmSync(p);
}

function approveTask(id) {
  const found = findTask(id);
  if (!found) throw new Error(`Gorev bulunamadi: ${id}`);
  if (found.state !== "approval") throw new Error(`Gorev onay beklemiyor: ${id}`);
  const task = found.task;
  if (task.planHash && task.planPreview && task.planHash !== hashText(task.planPreview)) {
    throw new Error("Plan onay beklerken degismis; yeniden planlanmasi gerekiyor.");
  }
  task.approved = true;
  task.status = "pending";
  moveTask(found.state, "pending", task);
  return task;
}

function rejectTask(id) {
  const found = findTask(id);
  if (!found) throw new Error(`Gorev bulunamadi: ${id}`);
  if (found.state !== "approval") throw new Error(`Gorev onay beklemiyor: ${id}`);
  found.task.status = "rejected";
  found.task.finishedAt = new Date().toISOString();
  moveTask(found.state, "failed", found.task);
  return found.task;
}

// ---- Hafiza ----
function getMemory(charBudget) {
  if (!fs.existsSync(MEM)) return "(hafiza bos)";
  const files = fs
    .readdirSync(MEM)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(MEM, f));
  if (!files.length) return "(hafiza bos)";
  let text = files.map((f) => fs.readFileSync(f, "utf8")).join("\n\n");
  if (charBudget && text.length > charBudget) text = text.slice(-charBudget);
  return text;
}
function appendMemory(title, body) {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  fs.appendFileSync(path.join(MEM, "log.md"), `\n## ${stamp} — ${title}\n${body}\n`);
}

// ---- Proje context (path'e ozel) ----
// Global log.md'nin aksine, her calisma klasorunun KENDI birikmis proje profili vardir:
// <cwd>/.crewctl/CONTEXT.md. Gorev acilisinda operatore yuklenir (tum kodu bastan taramaya
// gerek kalmasin), gorev bitiminde operator tarafindan REVIZE edilir (append degil). Calisma
// klasorunde durdugu icin seffaf, elle duzenlenebilir ve git'e girebilir.
function projectContextPath(cwd) {
  return path.join(cwd, ".crewctl", "CONTEXT.md");
}
function readProjectContext(cwd) {
  if (!cwd) return "";
  try { return fs.readFileSync(projectContextPath(cwd), "utf8"); } catch { return ""; }
}
function writeProjectContext(cwd, content) {
  if (!cwd) return false;
  try {
    fs.mkdirSync(path.join(cwd, ".crewctl"), { recursive: true });
    atomicWrite(projectContextPath(cwd), String(content == null ? "" : content));
    return true;
  } catch { return false; }
}
function clearProjectContext(cwd) {
  if (!cwd) return false;
  try { fs.rmSync(projectContextPath(cwd), { force: true }); return true; } catch { return false; }
}

// ---- Gunluk cagri butcesi ----
function callFile() {
  return path.join(STATE, `calls-${new Date().toISOString().slice(0, 10)}.txt`);
}
function getCallCount() {
  const f = callFile();
  return fs.existsSync(f) ? parseInt(fs.readFileSync(f, "utf8"), 10) || 0 : 0;
}
function bumpCallCount() {
  const n = getCallCount() + 1;
  fs.writeFileSync(callFile(), String(n));
  return n;
}

// ---- Gunluk token/maliyet birikimi ----
// Cagri sayacinin yanina gunluk token ve maliyet toplami. Ayri dosyada tutulur ki mevcut
// calls-*.txt bicimi (ve onu okuyan cli.js) hic degismesin. Bozuk/eksik dosya sifir sayilir;
// telemetri hicbir kosulda gorev akisini durdurmamali.
const USAGE_FIELDS = ["input", "output", "reasoning", "cacheRead", "cacheWrite", "cost"];
function usageFile(day) {
  return path.join(STATE, `usage-${day || new Date().toISOString().slice(0, 10)}.json`);
}
function getDailyUsage(day) {
  const empty = Object.fromEntries(USAGE_FIELDS.map((k) => [k, 0]));
  try {
    const parsed = JSON.parse(fs.readFileSync(usageFile(day), "utf8"));
    for (const key of USAGE_FIELDS) empty[key] = Number(parsed?.[key]) || 0;
    empty.calls = Number(parsed?.calls) || 0;
  } catch { empty.calls = 0; }
  return empty;
}
function addDailyUsage(usage) {
  const current = getDailyUsage();
  for (const key of USAGE_FIELDS) current[key] += Number(usage?.[key]) || 0;
  current.calls += 1;
  atomicWrite(usageFile(), JSON.stringify(current));
  return current;
}

module.exports = {
  ROOT,
  ASSETS,
  WORK_BASE,
  ensureDirs,
  loadConfig,
  normalizeConfig,
  saveConfig,
  listRoles,
  readRole,
  writeRole,
  deleteRole,
  listTasks,
  listRecentTasks,
  nextPending,
  addTask,
  addChatTask,
  addScheduledTask,
  saveTask,
  findTask,
  moveTask,
  removeTask,
  approveTask,
  rejectTask,
  getMemory,
  appendMemory,
  readProjectContext,
  writeProjectContext,
  clearProjectContext,
  projectContextPath,
  getCallCount,
  bumpCallCount,
  getDailyUsage,
  addDailyUsage,
  appendRunEvent,
  listRunEvents,
  hashText,
};
