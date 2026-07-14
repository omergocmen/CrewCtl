#!/usr/bin/env node
const path = require("path");
const store = require("./store");

const VERSION = require("../package.json").version;
const VALID_MODES = new Set(["auto", "fast", "balanced", "deep"]);

function help() {
  console.log(`CrewCtl ${VERSION}

Kurulu kodlama CLI'larini tek kuyrukta yonetin.

Kullanim:
  crewctl start                         Web panelini baslat
  crewctl doctor [--fix]                Ortami kontrol et (varsayilan salt okunur)
  crewctl run [--once] [--approval mod] Kuyrugu panelsiz calistir
  crewctl status [--json]               Kuyruk ve butce ozetini goster
  crewctl task <hedef> [secenekler]      Kuyruga gorev ekle
  crewctl approvals                      Onay bekleyen planlari listele
  crewctl approve <id>                   Plani onayla
  crewctl reject <id>                    Plani reddet

Task secenekleri:
  --dir <klasor>       Calisma klasoru
  --operator <cli>     codex | claude | gemini | opencode
  --mode <mod>         auto | fast | balanced | deep

Ornek:
  crewctl task "Testleri duzelt" --dir .. --mode balanced
  npm run cli -- status
`);
}

function takeOption(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`${name} icin deger gerekli.`);
  return args.splice(i, 2)[1];
}

function status(asJson) {
  store.ensureDirs();
  const cfg = store.loadConfig();
  const data = {
    operator: cfg.operator?.cli || null,
    approvalMode: cfg.approvalMode || "auto",
    callsToday: store.getCallCount(),
    dailyCallBudget: Number(cfg.dailyCallBudget || 0),
    queue: Object.fromEntries(["pending", "approval", "done", "failed"].map((s) => [s, store.listTasks(s).length])),
    activeAgents: Object.values(cfg.agents || {}).filter((a) => a.enabled !== false).length,
  };
  if (asJson) return console.log(JSON.stringify(data, null, 2));
  console.log(`Operator: ${data.operator || "yok"}  |  Mod: ${data.approvalMode}  |  Agent: ${data.activeAgents}`);
  console.log(`Kuyruk: ${data.queue.pending} bekleyen, ${data.queue.approval} onay, ${data.queue.done} tamam, ${data.queue.failed} basarisiz`);
  console.log(`Butce: ${data.callsToday}/${data.dailyCallBudget} cagri (bugun)`);
}

function addTask(args) {
  const targetDir = takeOption(args, "--dir");
  const operator = takeOption(args, "--operator");
  const mode = takeOption(args, "--mode") || "auto";
  if (!VALID_MODES.has(mode)) throw new Error(`Gecersiz mod: ${mode}`);
  const unknown = args.find((arg) => arg.startsWith("--"));
  if (unknown) throw new Error(`Bilinmeyen secenek: ${unknown}`);
  const prompt = args.join(" ").trim();
  if (!prompt) throw new Error("Gorev metni gerekli.");
  const cfg = store.loadConfig();
  const selectedOperator = operator || cfg.operator?.cli;
  const resolvedDir = targetDir ? path.resolve(targetDir) : undefined;
  const task = store.addTask(prompt, resolvedDir, selectedOperator, mode);
  console.log(`Eklendi: ${task.id}`);
  console.log(`Mod: ${mode}  |  Operator: ${selectedOperator || "varsayilan"}`);
}

function approvals() {
  const tasks = store.listTasks("approval");
  if (!tasks.length) return console.log("Onay bekleyen gorev yok.");
  for (const task of tasks) {
    console.log(`\n${task.id}  ${task.prompt}`);
    if (task.planPreview) console.log(String(task.planPreview).slice(0, 1200));
  }
}

function decide(id, action) {
  if (!id) throw new Error(`${action} icin gorev id'si gerekli.`);
  const task = action === "approve" ? store.approveTask(id) : store.rejectTask(id);
  console.log(`${action === "approve" ? "Onaylandi" : "Reddedildi"}: ${task.id}`);
}

async function run(args) {
  const approval = takeOption(args, "--approval");
  if (approval && !["ask", "auto"].includes(approval)) throw new Error("--approval ask veya auto olmali.");
  const once = args.includes("--once");
  if (approval) require("./engine").setMode(approval);
  const engine = require("./engine");
  if (once) {
    const task = store.nextPending();
    if (!task) return console.log("Kuyruk bos.");
    engine.running = true;
    try { await engine.runTask(task); }
    finally { engine.running = false; }
    return;
  }
  engine.start();
  console.log("Motor calisiyor. Durdurmak icin Ctrl+C.");
}

async function main(argv = process.argv.slice(2)) {
  store.ensureDirs();
  const [command = "help", ...args] = argv;
  if (["help", "--help", "-h"].includes(command)) return help();
  if (["--version", "-v", "version"].includes(command)) return console.log(VERSION);
  if (command === "start") return require("./server");
  if (command === "doctor") return require("./doctor").main({ fix: args.includes("--fix") });
  if (command === "run") return run(args);
  if (command === "status") return status(args.includes("--json"));
  if (command === "task") return addTask(args);
  if (command === "approvals") return approvals();
  if (command === "approve" || command === "reject") return decide(args[0], command);
  throw new Error(`Bilinmeyen komut: ${command}. Yardim icin: crewctl help`);
}

if (require.main === module) {
  main().catch((error) => { console.error(`Hata: ${error.message}`); process.exitCode = 1; });
}

module.exports = { main, takeOption };
