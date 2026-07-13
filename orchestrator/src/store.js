// store.js — dosya tabanli kuyruk, config, hafiza, butce (sifir bagimlilik)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const Q = path.join(ROOT, "queue");
const STATES = ["pending", "done", "failed", "approval"];
const MEM = path.join(ROOT, "memory");
const STATE = path.join(ROOT, "state");
const EVENTS = path.join(STATE, "events");
const ROLES = path.join(ROOT, "roles");

function ensureDirs() {
  [...STATES.map((s) => path.join(Q, s)), MEM, STATE, EVENTS, ROLES].forEach((d) =>
    fs.mkdirSync(d, { recursive: true })
  );
}

// Atomik yazma: once .tmp'ye yaz, sonra rename et. Rename ayni disk uzerinde atomiktir;
// boylece surec ortasinda cokme olsa bile yarim/bozuk JSON dosyasi kalmaz (her PC'de guvenli).
function atomicWrite(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

// ---- Config ----
// Minimal geri-donus varsayilani (config.default.json de yoksa kullanilir) — sistem her
// zaman calisir durumda acilsin diye.
const FALLBACK_CONFIG = {
  approvalMode: "auto", workingDir: "..", maxIterationsPerTask: 3, dailyCallBudget: 150,
  pollSeconds: 15, memoryCharBudget: 8000, teamContextCharBudget: 30000, agentTimeoutSeconds: 900,
  operator: { roleFile: "roles/operator.md", maxRounds: 6, maxDelegationsPerRound: 8, maxInfrastructureRecoveryRounds: 2, protocolRetries: 1, codexSettings: { model: "", reasoningEffort: "medium", serviceTier: "fast" } },
  agents: {}, riskyPatterns: [],
};
// config.json kisiye ozeldir (gitignore). Yoksa config.default.json sablonundan uretilir;
// boylece kullanici klonlayip `npm start` dedigi anda calisir ve kurulu CLI'lar keşifle eklenir.
function loadConfig() {
  const file = path.join(ROOT, "config.json");
  if (!fs.existsSync(file)) {
    const template = path.join(ROOT, "config.default.json");
    const seed = fs.existsSync(template) ? fs.readFileSync(template, "utf8") : JSON.stringify(FALLBACK_CONFIG, null, 2);
    atomicWrite(file, seed);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
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
  if (fs.existsSync(src)) fs.rmSync(src);
  saveTask(toState, task);
}
function removeTask(state, id) {
  const p = taskPath(state, id);
  if (fs.existsSync(p)) fs.rmSync(p);
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

module.exports = {
  ROOT,
  ensureDirs,
  loadConfig,
  saveConfig,
  listRoles,
  readRole,
  writeRole,
  deleteRole,
  listTasks,
  nextPending,
  addTask,
  addChatTask,
  saveTask,
  findTask,
  moveTask,
  removeTask,
  getMemory,
  appendMemory,
  getCallCount,
  bumpCallCount,
  appendRunEvent,
  listRunEvents,
  hashText,
};
