// Disa donuk MCP sunucusu testleri.
// Iki katman: (1) protokol/arac mantigi dogrudan, (2) `crewctl mcp` surecini GERCEK bir MCP
// istemcisi gibi stdio uzerinden konusturarak (framing + el sikisma + arac cagrisi).
// CrewCtl paneli yerine kucuk bir SAHTE HTTP API kullanilir; boylece test gercek motor
// calistirmaz, ag erisimi istemez ve deterministik kalir.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "crewctl-mcp-"));
process.env.CLI_TEAM_ROOT = ROOT;

const store = require("../src/store");

// ---- Sahte CrewCtl paneli ----
const calls = [];
const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    let parsed = null;
    try { parsed = body ? JSON.parse(body) : null; } catch {}
    calls.push({ method: req.method, url: req.url, body: parsed });
    const json = (code, payload) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (req.method === "POST" && req.url === "/api/tasks") {
      if (!parsed?.prompt) return json(400, { error: "prompt gerekli" });
      return json(200, { id: "T-1", status: "pending", prompt: parsed.prompt, executionMode: parsed.executionMode || "auto", operatorCli: parsed.operatorCli || "codex" });
    }
    if (req.method === "GET" && req.url === "/api/state") {
      return json(200, {
        status: { running: false, busy: false, current: null, callsToday: 4, budget: 150 },
        queue: { pending: [{ id: "T-1", status: "pending", prompt: "is" }], approval: [], done: [{ id: "T-0", status: "done", prompt: "eski", summary: "bitti" }], failed: [] },
        config: { approvalMode: "auto", operator: { cli: "codex" }, verify: { commands: ["npm test"] } },
        workingDir: "/tmp/proje",
      });
    }
    if (req.method === "GET" && req.url === "/api/tasks/T-1") {
      return json(200, { state: "done", task: { id: "T-1", status: "done", prompt: "is", summary: "tamam", delivery: { files: [{ path: "a.js", action: "created" }], verification: "Dogrulama kapisi GECTI", warnings: [], rounds: 1, agents: ["worker"] } } });
    }
    if (req.method === "GET" && req.url === "/api/tasks/yok") return json(404, { error: "gorev bulunamadi" });
    if (req.method === "POST" && req.url === "/api/engine") return json(200, { running: parsed?.action === "start", busy: false });
    return json(404, { error: "bilinmeyen uc" });
  });
});

function rpc(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

async function main() {
  await new Promise((resolve) => fake.listen(0, "127.0.0.1", resolve));
  const fakeUrl = `http://127.0.0.1:${fake.address().port}`;
  process.env.CREWCTL_URL = fakeUrl;

  const mcp = require("../src/mcp-server");

  // ---- Surum uzlasmasi ----
  assert.equal(mcp.initializeResult("2025-06-18").protocolVersion, "2025-06-18", "desteklenen surum AYNISIYLA yanitlanmali");
  assert.equal(mcp.initializeResult("1.0.0").protocolVersion, mcp.LATEST_PROTOCOL, "desteklenmeyen surumde kendi en yeni surumumuz donmeli");
  assert.equal(mcp.initializeResult(undefined).protocolVersion, mcp.LATEST_PROTOCOL, "surum verilmezse en yeni surum donmeli");
  const init = mcp.initializeResult("2025-11-25");
  assert.equal(init.serverInfo.name, "crewctl");
  assert.ok(init.capabilities.tools, "sunucu tools yetenegini bildirmeli");
  assert.ok(init.instructions.length > 40, "cagiran modele nasil kullanacagini anlatan instructions olmali");

  // ---- Framing: satir-sonu ile ayirma, yarim mesaji tamponda tutma ----
  const one = mcp.splitFrames('{"a":1}\n{"b":2}\n{"c":');
  assert.deepEqual(one.frames, ['{"a":1}', '{"b":2}'], "tam satirlar ayiklanmali");
  assert.equal(one.rest, '{"c":', "yarim mesaj tamponda kalmali");
  assert.deepEqual(mcp.splitFrames("\n\n").frames, [], "bos satirlar atlanmali");

  // ---- Bildirimlere yanit YAZILMAMALI ----
  assert.equal(await mcp.handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }), null, "bildirime yanit donmemeli");
  assert.equal(await mcp.handleMessage({ jsonrpc: "2.0", method: "ping" }), null, "id'siz ping bildirim sayilmali");
  const pong = await mcp.handleMessage({ jsonrpc: "2.0", id: 9, method: "ping" });
  assert.deepEqual(pong.result, {}, "id'li ping bos sonuc donmeli");

  // ---- Bilinmeyen metot ve bos listeler ----
  assert.equal((await mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "olmayan/metot" })).error.code, -32601);
  assert.deepEqual((await mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "prompts/list" })).result, { prompts: [] }, "prompts/list bos liste donmeli (-32601 degil)");
  assert.deepEqual((await mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "resources/list" })).result, { resources: [] });
  // 2026-07-28 revizyonu el sikismayi kaldirdi: server/discover es-anlamli olmali.
  assert.equal((await mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "server/discover" })).result.serverInfo.name, "crewctl");

  // ---- Arac katalogu: motor kontrolu VARSAYILAN OLARAK gizli ----
  store.ensureDirs();
  const cfg = store.loadConfig();
  assert.equal(cfg.mcpServer.allowEngineControl, false, "varsayilan yapilandirmada motor kontrolu kapali olmali");
  let names = mcp.toolDefinitions().map((t) => t.name);
  assert.ok(names.includes("crewctl_add_task") && names.includes("crewctl_task_status")
    && names.includes("crewctl_list_tasks") && names.includes("crewctl_engine_status"), "temel araclar sunulmali");
  assert.ok(!names.includes("crewctl_engine_control"), "motor kontrolu kapaliyken katalogda GORUNMEMELI");
  for (const tool of mcp.toolDefinitions()) {
    assert.equal(tool.inputSchema.type, "object", `${tool.name} inputSchema nesne olmali`);
    assert.ok(tool.description.length > 20, `${tool.name} aciklamasi modele yeterli baglam vermeli`);
  }
  // Kapaliyken cagrilirsa net bir arac hatasi donmeli (protokol hatasi degil).
  const blocked = await mcp.callTool("crewctl_engine_control", { action: "start" });
  assert.equal(blocked.isError, true, "kapali motor kontrolu isError donmeli");
  assert.match(blocked.content[0].text, /allowEngineControl/, "hata kullaniciya nasil acacagini soylemeli");

  // ---- Motor kontrolu ACIKKEN katalogda gorunur ve calisir ----
  store.saveConfig({ ...cfg, mcpServer: { allowEngineControl: true } });
  names = mcp.toolDefinitions().map((t) => t.name);
  assert.ok(names.includes("crewctl_engine_control"), "izin verilince motor kontrolu katalogda gorunmeli");
  const started = await mcp.callTool("crewctl_engine_control", { action: "start" });
  assert.ok(!started.isError, "izinli motor kontrolu basarili olmali");
  assert.match(started.content[0].text, /"running": true/);
  assert.equal((await mcp.callTool("crewctl_engine_control", { action: "sacma" })).isError, true, "gecersiz action reddedilmeli");
  store.saveConfig({ ...cfg, mcpServer: { allowEngineControl: false } });

  // ---- Araclar ----
  const added = await mcp.callTool("crewctl_add_task", { prompt: "  Testleri duzelt  ", mode: "balanced", directory: "/tmp/proje" });
  assert.ok(!added.isError, "gorev ekleme basarili olmali");
  const addCall = calls.find((c) => c.url === "/api/tasks");
  assert.equal(addCall.body.prompt, "Testleri duzelt", "prompt trim'lenerek gonderilmeli");
  assert.equal(addCall.body.executionMode, "balanced", "mod executionMode olarak eslenmeli");
  assert.equal(addCall.body.targetDir, "/tmp/proje", "directory targetDir olarak eslenmeli");
  // Motor durmusken kullanici bunu BILMELI; aksi halde gorev sessizce bekler.
  assert.match(added.content[0].text, /Motor su anda DURMUS/, "motor durmussa gorev eklemede uyarilmali");

  assert.equal((await mcp.callTool("crewctl_add_task", { prompt: "   " })).isError, true, "bos prompt reddedilmeli");
  assert.equal((await mcp.callTool("crewctl_add_task", { prompt: "x", mode: "hizli" })).isError, true, "gecersiz mod reddedilmeli");
  assert.equal((await mcp.callTool("crewctl_bilinmeyen", {})).isError, true, "bilinmeyen arac isError donmeli");

  const statusText = (await mcp.callTool("crewctl_task_status", { taskId: "T-1" })).content[0].text;
  assert.match(statusText, /"status": "done"/);
  assert.match(statusText, /Dogrulama kapisi GECTI/, "dogrulama kanit alani cagirana aktarilmali");
  assert.equal((await mcp.callTool("crewctl_task_status", {})).isError, true, "taskId zorunlu olmali");

  const listed = JSON.parse((await mcp.callTool("crewctl_list_tasks", { state: "pending" })).content[0].text);
  assert.deepEqual(Object.keys(listed), ["pending"], "durum filtresi uygulanmali");
  assert.equal(listed.pending[0].id, "T-1");
  const listedAll = JSON.parse((await mcp.callTool("crewctl_list_tasks", {})).content[0].text);
  assert.deepEqual(Object.keys(listedAll), ["pending", "approval", "done", "failed"], "varsayilan tum durumlari dondurmeli");

  const engineText = (await mcp.callTool("crewctl_engine_status", {})).content[0].text;
  assert.match(engineText, /"running": false/);
  assert.match(engineText, /"dailyCallBudget": 150/, "butce bilgisi aktarilmali");

  // ---- Panel KAPALIYKEN: net yonlendirme, cokme yok ----
  process.env.CREWCTL_URL = "http://127.0.0.1:1";
  const offline = await mcp.handleMessage({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "crewctl_engine_status" } });
  assert.equal(offline.result.isError, true, "panel kapaliyken arac hatasi donmeli");
  assert.match(offline.result.content[0].text, /paneli baslatmasini/, "kullaniciya paneli baslatmasi soylenmeli");
  assert.ok(!offline.error, "panel kapali olmasi PROTOKOL hatasi olmamali");
  process.env.CREWCTL_URL = fakeUrl;

  // ---- UCTAN UCA: `crewctl mcp` sureci gercek bir istemci gibi konusturulur ----
  const child = spawn(process.execPath, [path.join(__dirname, "..", "src", "cli.js"), "mcp"], {
    env: { ...process.env, CLI_TEAM_ROOT: ROOT, CREWCTL_URL: fakeUrl },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const responses = [];
  let out = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    out += chunk;
    const parts = out.split("\n");
    out = parts.pop();
    for (const line of parts) if (line.trim()) responses.push(JSON.parse(line));
  });
  let childErr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (c) => { childErr += c; });

  rpc(child, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
  rpc(child, { jsonrpc: "2.0", method: "notifications/initialized" });
  rpc(child, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  rpc(child, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "crewctl_add_task", arguments: { prompt: "stdio uzerinden gorev" } } });
  // Iki mesaji TEK yazimda gonder: framing gercekten satir bazli mi?
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 4, method: "ping" })}\n${JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/list" })}\n`);

  const deadline = Date.now() + 20000;
  while (responses.length < 5 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  child.stdin.end();

  assert.equal(responses.length, 5, `bes yanit beklendi, gelen: ${responses.length} (stderr: ${childErr})`);
  const byId = Object.fromEntries(responses.map((r) => [r.id, r]));
  assert.equal(byId[1].result.protocolVersion, "2025-06-18", "el sikisma istemcinin surumunu korumali");
  assert.ok(!byId[1].result.capabilities.resources, "sunmadigimiz yetenek bildirilmemeli");
  assert.ok(byId[2].result.tools.length >= 4, "tools/list araclari dondurmeli");
  assert.match(byId[3].result.content[0].text, /Gorev kuyruga eklendi/, "stdio uzerinden gorev eklenebilmeli");
  assert.deepEqual(byId[4].result, {}, "ping bos sonuc donmeli");
  assert.ok(byId[5].result.tools, "tek yazimdaki ikinci mesaj da islenmeli");
  // Bildirime yanit yazilmadi (4 istek + 1 = 5 yanit; notifications/initialized sayilmadi).
  assert.ok(!responses.some((r) => r.id === undefined || r.id === null), "bildirim icin yanit yazilmamali");
  assert.match(childErr, /MCP sunucusu hazir/, "teshis mesaji stdout'u DEGIL stderr'i kullanmali");

  await new Promise((resolve) => child.on("exit", resolve));

  console.log("mcp server ok");
}

main()
  .then(() => {
    fake.close();
    fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
  })
  .catch((error) => {
    console.error(error);
    fake.close();
    process.exit(1);
  });
