// server-flow.test.js — HTTP ucları için gerçek çalışma zamanı testi. Sunucuyu ayrı bir
// süreçte, izole bir ROOT ile başlatır ve panelin gerçekten kullanılabilir olduğunu doğrular.
// Buradaki asıl regresyon: açılıştaki CLI sağlık testi sürerken görev gönderimi 409 ile
// reddediliyordu (ölçülen: 13.3 saniye). Bir daha olmamalı.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const net = require("net");
const { spawn } = require("child_process");

const REPO = path.join(__dirname, "..");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "cli-team-serverflow-"));
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "cli-team-serverwork-"));
let PORT = 0;
fs.mkdirSync(path.join(ROOT, "roles"), { recursive: true });
for (const file of fs.readdirSync(path.join(REPO, "roles"))) {
  fs.copyFileSync(path.join(REPO, "roles", file), path.join(ROOT, "roles", file));
}
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "config.default.json"), "utf8"));
cfg.workingDir = WORK;
cfg.autonomousConsentAcceptedAt = new Date().toISOString();
fs.writeFileSync(path.join(ROOT, "config.json"), JSON.stringify(cfg, null, 2));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE_SOCKET_CODES = new Set(["ECONNRESET", "ECONNREFUSED"]);
function reservePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}
function requestOnce(method, urlPath, body) {
  return new Promise((resolve) => {
    let done = false;
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { host: "127.0.0.1", port: PORT, path: urlPath, method, headers: data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {} },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => { if (!done) { done = true; resolve({ status: res.statusCode, body: (() => { try { return JSON.parse(buf); } catch { return buf; } })() }); } });
      },
    );
    req.on("error", (err) => { if (!done) { done = true; resolve({ status: 0, error: err }); } });
    if (data) req.write(data);
    req.end();
  });
}
async function request(method, urlPath, body, attempts = 1) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await requestOnce(method, urlPath, body);
    if (result.status !== 0 || !RETRYABLE_SOCKET_CODES.has(result.error?.code) || attempt === attempts) return result;
    await sleep(75 * attempt);
  }
}

async function main() {
  PORT = await reservePort();
  const server = spawn(process.execPath, [path.join(REPO, "src", "server.js")], {
    env: { ...process.env, CLI_TEAM_ROOT: ROOT, PORT: String(PORT) },
    cwd: WORK,
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));

  let up = false;
  try {
    for (let i = 0; i < 600; i++) {
      const res = await request("GET", "/api/state", null, 3);
      if (res.status === 200) { up = true; break; }
      await sleep(50);
    }
    assert.ok(up, `sunucu ayaga kalkmadi:\n${serverLog}`);

    // REGRESYON: HTTP ayaga kalkar kalkmaz gorev gonderimi KABUL edilmeli. Eskiden CLI
    // saglik testi bitene kadar 409 donuyordu; "testing"/"unknown" artik engellemiyor.
    const submit = await request("POST", "/api/tasks", { prompt: "Merhaba" }, 4);
    assert.notEqual(submit.status, 409, `saglik testi surerken gorev 409 ile reddedildi: ${JSON.stringify(submit.body)}`);
    // Kurulu CLI yoksa 400 dogru cevaptir; kurulu CLI varsa gorev kuyruga girmeli.
    assert.ok(submit.status === 200 || submit.status === 400, `beklenmeyen durum ${submit.status}: ${JSON.stringify(submit.body)} err: ${submit.error?.message||submit.error} log:\n${serverLog}`);
    // /api/tasks POST gorev nesnesinin KENDISINI doner (sarmalayici yok).
    if (submit.status === 200) {
      assert.ok(submit.body?.id, "kabul edilen gorev id almali");
      assert.equal(submit.body.status, "pending");
    }

    // Bos prompt hala reddedilmeli (dogrulama gevsemedi).
    assert.equal((await request("POST", "/api/tasks", { prompt: "   " })).status, 400);

    // Temel uclar cevap vermeli.
    for (const p of ["/api/state", "/api/config", "/api/skills", "/api/checkpoints"]) {
      assert.equal((await request("GET", p)).status, 200, `${p} 200 donmeli`);
    }
    assert.equal((await request("GET", "/api/tasks/olmayan-gorev-id")).status, 404);

    // Kesif onbellegi yazilmis olmali; kurulu CLI yoksa bos kalabilir, sema yine de gecerli.
    const saved = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
    if (saved.cliDiscoveryCache) {
      assert.equal(saved.cliDiscoveryCache.version, 1);
      assert.ok(!saved.cliDiscoveryCache.results?.opencode, "opencode onbelleklenmemeli (model/ready durumu degisir)");
    }
    assert.ok(!/unhandled|UnhandledPromiseRejection/i.test(serverLog), `sunucu log'unda unhandled rejection:\n${serverLog}`);
  } finally {
    server.kill();
    await sleep(500);
    for (const dir of [ROOT, WORK]) {
      try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {}
    }
  }
  console.log("server flow ok");
}

main().catch((error) => { console.error(error); process.exit(1); });
