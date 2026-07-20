// server-flow.test.js — HTTP ucları için gerçek çalışma zamanı testi. Sunucuyu ayrı bir
// süreçte, izole bir ROOT ile başlatır ve panelin gerçekten kullanılabilir olduğunu doğrular.
// Buradaki asıl regresyon: açılıştaki CLI sağlık testi sürerken görev gönderimi 409 ile
// reddediliyordu (ölçülen: 13.3 saniye). Bir daha olmamalı.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const REPO = path.join(__dirname, "..");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "cli-team-serverflow-"));
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "cli-team-serverwork-"));
const PORT = 4600 + (process.pid % 300);

fs.mkdirSync(path.join(ROOT, "roles"), { recursive: true });
for (const file of fs.readdirSync(path.join(REPO, "roles"))) {
  fs.copyFileSync(path.join(REPO, "roles", file), path.join(ROOT, "roles", file));
}
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "config.default.json"), "utf8"));
cfg.workingDir = WORK;
cfg.autonomousConsentAcceptedAt = new Date().toISOString();
fs.writeFileSync(path.join(ROOT, "config.json"), JSON.stringify(cfg, null, 2));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { host: "127.0.0.1", port: PORT, path: urlPath, method, headers: data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {} },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => resolve({ status: res.statusCode, body: (() => { try { return JSON.parse(buf); } catch { return buf; } })() }));
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const server = spawn(process.execPath, [path.join(REPO, "src", "server.js")], {
    env: { ...process.env, CLI_TEAM_ROOT: ROOT, PORT: String(PORT) },
    cwd: WORK,
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));

  try {
    let up = false;
    for (let i = 0; i < 600; i++) {
      try { await request("GET", "/api/state"); up = true; break; } catch { await sleep(50); }
    }
    assert.ok(up, `sunucu ayaga kalkmadi:\n${serverLog}`);

    // REGRESYON: HTTP ayaga kalkar kalkmaz gorev gonderimi KABUL edilmeli. Eskiden CLI
    // saglik testi bitene kadar 409 donuyordu; "testing"/"unknown" artik engellemiyor.
    const submit = await request("POST", "/api/tasks", { prompt: "Merhaba" });
    assert.notEqual(submit.status, 409, `saglik testi surerken gorev 409 ile reddedildi: ${JSON.stringify(submit.body)}`);
    // Kurulu CLI yoksa 400 dogru cevaptir; kurulu CLI varsa gorev kuyruga girmeli.
    assert.ok(submit.status === 200 || submit.status === 400, `beklenmeyen durum ${submit.status}: ${JSON.stringify(submit.body)}`);
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
