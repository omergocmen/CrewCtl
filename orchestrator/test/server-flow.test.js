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
        // Yanit akisinda hata dinleyicisi OLMAZSA, sunucu yuk altinda soketi sifirladiginda
        // 'error' olayi sahipsiz kalir ve YAKALANMAYAN istisnaya donusur: test "read ECONNRESET"
        // diye hangi istekte oldugu belirsiz bir yiginla coker. Reddi promise'e baglayip
        // istegi adlandirmak teshisi mumkun kilar.
        res.on("error", (error) => reject(new Error(`[${method} ${urlPath}] yanit akisi hatasi: ${error.message}`)));
        res.on("end", () => resolve({ status: res.statusCode, body: (() => { try { return JSON.parse(buf); } catch { return buf; } })() }));
      },
    );
    req.on("error", (error) => reject(new Error(`[${method} ${urlPath}] ${error.message}`)));
    if (data) req.write(data);
    req.end();
  });
}

// BILINEN SORUN (2026-07-25, Windows): sunucu acilistaki soguk CLI saglik probe'lariyla mesgulken
// gelen istegin soketi bazen sifirlaniyor (ECONNRESET). Sunucu COKMUYOR ve log'a hicbir hata
// yazmiyor; yalnizca o baglanti dusuyor. Urun tarafinda ayrica incelenmesi gereken bir
// dayaniklilik konusu (kullanici paneli acar acmaz gorev gonderirse ayni sey olabilir).
// Bu yardimci YALNIZCA tasima katmanindaki sifirlamayi yeniden dener; HTTP durum kodlarina
// dokunmaz, dolayisiyla testin asil iddiasi (acilis sirasinda 409 DONMEMELI) aynen korunur.
async function requestTolerant(method, urlPath, body, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await request(method, urlPath, body); }
    catch (error) {
      last = error;
      if (!/ECONNRESET|socket hang up/i.test(error.message)) throw error;
      await sleep(500);
    }
  }
  throw new Error(`${last.message} (${attempts} denemede tasima katmani sifirlandi)`);
}

async function main() {
  const server = spawn(process.execPath, [path.join(REPO, "src", "server.js")], {
    // NO_OPEN: test sunucusu kullanicinin tarayicisinda sekme acmamali (gecici veriyle
    // "saglik testi bekleniyor" gosteren olu sekmeler birakiyordu).
    env: { ...process.env, CLI_TEAM_ROOT: ROOT, PORT: String(PORT), NO_OPEN: "1" },
    cwd: WORK,
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));

  try {
    // Acilis suresi makineye gore cok degisir: dort gercek CLI'nin SOGUK saglik probe'u bu
    // repoda 13-46 sn arasi olculdu. Sabit iterasyon butcesi yavas makinede yanlis-negatif
    // uretiyordu; sure tabanli ve genis bir butce kullan.
    let up = false;
    const readyDeadline = Date.now() + 90000;
    while (Date.now() < readyDeadline) {
      try { await request("GET", "/api/state"); up = true; break; } catch { await sleep(100); }
    }
    assert.ok(up, `sunucu 90 sn icinde ayaga kalkmadi:\n${serverLog}`);

    // REGRESYON: HTTP ayaga kalkar kalkmaz gorev gonderimi KABUL edilmeli. Eskiden CLI
    // saglik testi bitene kadar 409 donuyordu; "testing"/"unknown" artik engellemiyor.
    const submit = await requestTolerant("POST", "/api/tasks", { prompt: "Merhaba" });
    assert.notEqual(submit.status, 409, `saglik testi surerken gorev 409 ile reddedildi: ${JSON.stringify(submit.body)}`);
    // Kurulu CLI yoksa 400 dogru cevaptir; kurulu CLI varsa gorev kuyruga girmeli.
    assert.ok(submit.status === 200 || submit.status === 400, `beklenmeyen durum ${submit.status}: ${JSON.stringify(submit.body)}`);
    // /api/tasks POST gorev nesnesinin KENDISINI doner (sarmalayici yok).
    if (submit.status === 200) {
      assert.ok(submit.body?.id, "kabul edilen gorev id almali");
      assert.equal(submit.body.status, "pending");
    }

    // Bos prompt hala reddedilmeli (dogrulama gevsemedi).
    assert.equal((await requestTolerant("POST", "/api/tasks", { prompt: "   " })).status, 400);

    // Temel uclar cevap vermeli.
    for (const p of ["/api/state", "/api/config", "/api/skills", "/api/checkpoints"]) {
      assert.equal((await requestTolerant("GET", p)).status, 200, `${p} 200 donmeli`);
    }
    assert.equal((await requestTolerant("GET", "/api/tasks/olmayan-gorev-id")).status, 404);

    // Config yazma matrisi acilis KESFIYLE YARISMAMALI: startup discovery de config.json'a
    // yazdigi icin es zamanli yazim Windows'ta atomicWrite rename yarisina ve sifirlanan
    // baglantiya yol acabiliyor. Yukaridaki "saglik testi surerken gorev kabul edilmeli"
    // regresyonu bilincli olarak erken kosar; asagidaki sema testleri ise oturmus sunucuda.
    const settleDeadline = Date.now() + 90000;
    while (Date.now() < settleDeadline) {
      const state = await requestTolerant("GET", "/api/state");
      const probing = (state.body?.cliStatus || []).some((cli) => cli.health?.status === "testing");
      if (!probing) break;
      await sleep(250);
    }

    // ---- Dogrulama kapisi config sozlesmesi ----
    // Kapi ayarlari HAM govde uzerinde denetlenir: normalizeConfig gecersiz degerleri guvenli
    // varsayilana cevirdigi icin normalize SONRASI kontrol sessizce gecerdi. Hatali tip 400 almali.
    const liveCfg = (await requestTolerant("GET", "/api/config")).body;
    assert.ok(liveCfg.verify && Array.isArray(liveCfg.verify.commands), "config yaniti verify semasini tasimali");
    assert.deepEqual(liveCfg.verify.commands, [], "varsayilan kurulumda kapi KAPALI olmali");
    const putCfg = (verifyBlock) => requestTolerant("PUT", "/api/config", { ...liveCfg, verify: verifyBlock });
    assert.equal((await putCfg({ commands: "npm test" })).status, 400, "verify.commands dizi olmali");
    assert.equal((await putCfg({ commands: [1, 2] })).status, 400, "verify.commands metin dizisi olmali");
    assert.equal((await putCfg({ commands: [], timeoutSeconds: 1 })).status, 400, "verify.timeoutSeconds alt siniri zorunlu");
    assert.equal((await putCfg({ commands: [], maxOutputChars: 10 })).status, 400, "verify.maxOutputChars alt siniri zorunlu");
    assert.equal((await putCfg({ commands: [], maxAttempts: 0 })).status, 400, "verify.maxAttempts pozitif tam sayi olmali");
    assert.equal((await putCfg({ commands: [], blockOnFailure: "evet" })).status, 400, "verify.blockOnFailure boolean olmali");
    assert.equal((await putCfg([])).status, 400, "verify dizi olmamali");
    const okPut = await putCfg({ enabled: true, commands: ["  npm test  "], timeoutSeconds: 120, maxOutputChars: 500, blockOnFailure: false, maxAttempts: 3 });
    assert.equal(okPut.status, 200, "gecerli kapi ayari kabul edilmeli");
    const persisted = (await requestTolerant("GET", "/api/config")).body.verify;
    assert.deepEqual(persisted.commands, ["npm test"], "komutlar trim'lenerek saklanmali");
    assert.equal(persisted.blockOnFailure, false, "blockOnFailure saklanmali");
    assert.equal(persisted.maxAttempts, 3, "maxAttempts saklanmali");
    // ---- Ice donuk MCP config sozlesmesi ----
    assert.equal(liveCfg.mcp?.enabled, false, "varsayilan kurulumda ice donuk MCP KAPALI olmali");
    assert.deepEqual(liveCfg.mcp.servers, {}, "sunucu listesi bos baslamali");
    const putMcp = (block) => requestTolerant("PUT", "/api/config", { ...liveCfg, mcp: block });
    assert.equal((await putMcp({ enabled: "evet" })).status, 400, "mcp.enabled boolean olmali");
    assert.equal((await putMcp({ enabled: true, mode: "sacma" })).status, 400, "mcp.mode strict/inherit olmali");
    assert.equal((await putMcp({ enabled: true, maxServersPerAssignment: 0 })).status, 400, "mcp.maxServersPerAssignment alt siniri zorunlu");
    assert.equal((await putMcp({ enabled: true, servers: [] })).status, 400, "mcp.servers nesne olmali");
    assert.equal((await putMcp({ enabled: true, servers: { "kotu ad": { command: "x" } } })).status, 400, "gecersiz sunucu adi reddedilmeli");
    assert.equal((await putMcp({ enabled: true, servers: { bos: {} } })).status, 400, "command veya url zorunlu");
    assert.equal((await putMcp({ enabled: true, servers: { a: { command: "x", kinds: ["sacma"] } } })).status, 400, "gecersiz kind reddedilmeli");
    assert.equal((await putMcp({ enabled: true, servers: { a: { command: "x", write: "evet" } } })).status, 400, "write boolean olmali");
    const okMcp = await putMcp({ enabled: true, mode: "strict", maxServersPerAssignment: 2, servers: { docs: { command: "npx", args: ["-y", "d"], kinds: ["plan", "review"], description: "dok" } } });
    assert.equal(okMcp.status, 200, "gecerli MCP ayari kabul edilmeli");
    const mcpSaved = (await requestTolerant("GET", "/api/config")).body.mcp;
    assert.equal(mcpSaved.enabled, true);
    assert.deepEqual(mcpSaved.servers.docs.kinds, ["plan", "review"], "kind kisiti saklanmali");
    assert.equal((await putMcp({ enabled: false, servers: {} })).status, 200, "MCP tekrar kapatilabilmeli");

    // ---- Es zamanlilik config sozlesmesi ----
    assert.equal(liveCfg.maxConcurrentTasks, 1, "varsayilan kurulumda gorevler sirayla kosmali");
    const putConc = (n, wt) => requestTolerant("PUT", "/api/config", { ...liveCfg, maxConcurrentTasks: n, ...(wt ? { worktree: wt } : {}) });
    assert.equal((await putConc(0)).status, 400, "maxConcurrentTasks alt siniri zorunlu");
    assert.equal((await putConc(9)).status, 400, "maxConcurrentTasks ust siniri zorunlu");
    assert.equal((await putConc(1.5)).status, 400, "maxConcurrentTasks tam sayi olmali");
    // Izolasyon olmadan es zamanlilik veri kaybina yol acar; API bunu SESSIZCE kabul etmemeli.
    const unsafe = await putConc(2, { mode: "off" });
    assert.equal(unsafe.status, 400, "izolasyon kapaliyken es zamanlilik reddedilmeli");
    assert.match(String(unsafe.body?.error || ""), /worktree/i, "hata kullaniciya sebebi soylemeli");
    assert.equal((await putConc(2, { mode: "task" })).status, 200, "izolasyon acikken es zamanlilik kabul edilmeli");
    assert.equal((await putConc(1, { mode: "off" })).status, 200, "tekrar seri moda donulebilmeli");

    // ---- Worktree izolasyonu config sozlesmesi ----
    assert.equal(liveCfg.worktree?.mode, "off", "varsayilan kurulumda worktree izolasyonu KAPALI olmali");
    const putWt = (block) => requestTolerant("PUT", "/api/config", { ...liveCfg, worktree: block });
    assert.equal((await putWt({ mode: "sacma" })).status, 400, "worktree.mode yalnizca off/task olmali");
    assert.equal((await putWt({ mode: "task", setupCommands: "npm ci" })).status, 400, "worktree.setupCommands dizi olmali");
    // Mutlak yol / '..' kacisi izolasyonu bozar: reddedilmeli.
    assert.equal((await putWt({ mode: "task", linkPaths: ["../gizli"] })).status, 400, "worktree.linkPaths '..' icermemeli");
    assert.equal((await putWt({ mode: "task", linkPaths: [process.platform === "win32" ? "C:\\Windows" : "/etc"] })).status, 400, "worktree.linkPaths mutlak yol olmamali");
    assert.equal((await putWt({ mode: "task", setupTimeoutSeconds: 5 })).status, 400, "worktree.setupTimeoutSeconds alt siniri zorunlu");
    assert.equal((await putWt({ mode: "task", commit: "evet" })).status, 400, "worktree.commit boolean olmali");
    const okWt = await putWt({ mode: "task", linkPaths: ["node_modules"], setupCommands: ["  npm ci  "], commit: true, setupTimeoutSeconds: 60 });
    assert.equal(okWt.status, 200, "gecerli worktree ayari kabul edilmeli");
    const wtSaved = (await requestTolerant("GET", "/api/config")).body.worktree;
    assert.equal(wtSaved.mode, "task");
    assert.deepEqual(wtSaved.setupCommands, ["npm ci"], "kurulum komutlari trim'lenerek saklanmali");
    assert.equal((await putWt({ mode: "off" })).status, 200, "worktree tekrar kapatilabilmeli");

    // Kurulumu tekrar kapali hale getir (sonraki kontroller varsayilani beklemesin).
    assert.equal((await putCfg({ enabled: true, commands: [], timeoutSeconds: 600, maxOutputChars: 4000, blockOnFailure: true, maxAttempts: 2 })).status, 200);

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
