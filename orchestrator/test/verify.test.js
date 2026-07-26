// Dogrulama kapisi testleri. Iki katman ayri dogrulanir:
//   1) verify.js — saf normalizasyon + gercek komut kosumu (yalitilmis, gecici klasorde)
//   2) engine.verifyStillBlocking / verifyWarnings — kirmizi kapinin teslimati kac kez engelledigi
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Store'un veri kokunu izole et: testler kullanicinin gercek ~/.crewctl'ini kirletmemeli.
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "crewctl-verify-"));
process.env.CLI_TEAM_ROOT = ROOT;

const verify = require("../src/verify");
const store = require("../src/store");
const engine = require("../src/engine");

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "crewctl-verify-work-"));

async function main() {
  // ---- normalizeVerifyConfig: saf, idempotent, guvenli varsayilanlar ----
  const empty = verify.normalizeVerifyConfig({});
  assert.deepEqual(empty.commands, [], "verify yoksa komut listesi bos olmali");
  assert.equal(empty.enabled, true, "enabled varsayilan olarak acik");
  assert.equal(empty.blockOnFailure, true, "blockOnFailure varsayilan olarak acik");
  assert.equal(empty.maxAttempts, 2, "maxAttempts varsayilani 2");

  const raw = { verify: { commands: ["  npm test  ", "", "  ", "tsc"], timeoutSeconds: 1, maxOutputChars: 10, maxAttempts: 0 } };
  const snapshot = JSON.stringify(raw);
  const normalized = verify.normalizeVerifyConfig(raw);
  assert.equal(JSON.stringify(raw), snapshot, "normalizeVerifyConfig girdiyi degistirmemeli");
  assert.deepEqual(normalized.commands, ["npm test", "tsc"], "komutlar trim'lenip bos olanlar atilmali");
  assert.equal(normalized.timeoutSeconds, 600, "5 sn altindaki timeout guvenli varsayilana dusmeli");
  assert.equal(normalized.maxOutputChars, 4000, "200 karakter altindaki limit varsayilana dusmeli");
  assert.equal(normalized.maxAttempts, 2, "gecersiz maxAttempts (0) guvenli varsayilana dusmeli");
  assert.equal(verify.normalizeVerifyConfig({ verify: { maxAttempts: 5 } }).maxAttempts, 5, "gecerli maxAttempts korunmali");
  assert.deepEqual(verify.normalizeVerifyConfig({ verify: normalized }), normalized, "normalizeVerifyConfig idempotent olmali");

  // ---- isActive: komut yoksa kapi kapali (opt-in sozlesmesi) ----
  assert.equal(verify.isActive({}), false, "komut yoksa kapi etkin olmamali");
  assert.equal(verify.isActive({ verify: { commands: ["npm test"] } }), true, "komut varsa kapi etkin");
  assert.equal(verify.isActive({ verify: { enabled: false, commands: ["npm test"] } }), false, "enabled:false kapiyi kapatmali");

  // ---- runCommand: basarili komut ----
  const ok = await verify.runCommand(`node -e "console.log('MERHABA')"`, { cwd: WORK, timeoutMs: 30000 });
  assert.equal(ok.ok, true, "cikis kodu 0 olan komut basarili sayilmali");
  assert.equal(ok.exitCode, 0);
  assert.match(ok.output, /MERHABA/, "stdout yakalanmali");

  // ---- runCommand: basarisiz komut, stderr yakalanmasi ----
  const fail = await verify.runCommand(`node -e "console.error('KIRMIZI'); process.exit(3)"`, { cwd: WORK, timeoutMs: 30000 });
  assert.equal(fail.ok, false, "sifir olmayan cikis kodu basarisizlik olmali");
  assert.equal(fail.exitCode, 3, "gercek cikis kodu raporlanmali");
  assert.match(fail.output, /KIRMIZI/, "stderr de yakalanmali");

  // ---- runCommand: zaman asimi proses agacini oldurmeli ----
  const slow = await verify.runCommand(`node -e "setTimeout(()=>{},60000)"`, { cwd: WORK, timeoutMs: 1200 });
  assert.equal(slow.ok, false, "zaman asimina ugrayan komut basarisiz olmali");
  assert.equal(slow.timedOut, true, "timedOut isaretlenmeli");
  assert.ok(slow.durationMs < 30000, "komut timeout'tan kisa sure sonra sonlandirilmali");

  // ---- runCommand: komut cwd'de kosmali ----
  fs.writeFileSync(path.join(WORK, "isaret.txt"), "var", "utf8");
  const inCwd = await verify.runCommand(`node -e "console.log(require('fs').existsSync('isaret.txt'))"`, { cwd: WORK, timeoutMs: 30000 });
  assert.match(inCwd.output, /true/, "komut calisma klasorunde kosmali");

  // ---- runVerification: ilk basarisizlikta durmali (fail-fast) ----
  const report = await verify.runVerification(
    [`node -e "process.exit(0)"`, `node -e "process.exit(1)"`, `node -e "console.log('KOSMAMALI')"`],
    { cwd: WORK, timeoutMs: 30000 },
  );
  assert.equal(report.ok, false, "bir komut basarisizsa rapor kirmizi olmali");
  assert.equal(report.ran, 2, "ilk basarisizliktan sonra kalan komutlar kosulmamali");
  assert.equal(report.total, 3, "toplam komut sayisi korunmali");
  assert.equal(report.failed.exitCode, 1, "basarisiz komut raporlanmali");

  const allOk = await verify.runVerification([`node -e "process.exit(0)"`, `node -e "process.exit(0)"`], { cwd: WORK, timeoutMs: 30000 });
  assert.equal(allOk.ok, true, "tum komutlar gecerse rapor yesil olmali");
  assert.equal(allOk.ran, 2);

  const none = await verify.runVerification([], { cwd: WORK });
  assert.equal(none.ok, true, "komut yoksa kapi gecmis sayilir");
  assert.equal(none.ran, 0);

  // ---- summarize / reportForPrompt ----
  assert.match(verify.summarize(allOk), /GECTI/, "yesil ozet GECTI icermeli");
  assert.match(verify.summarize(report), /BASARISIZ/, "kirmizi ozet BASARISIZ icermeli");
  assert.equal(verify.summarize({ skipped: true }), "", "atlanan kapi ozet uretmemeli");
  const prompt = verify.reportForPrompt(report, 500);
  assert.match(prompt, /DOGRULAMA BASARISIZ/, "operator raporu net bir basarisizlik basligi icermeli");
  assert.match(prompt, /cikis kodu 1/, "operator raporu cikis kodunu tasimali");
  assert.equal(verify.reportForPrompt({ skipped: true }), "", "atlanan kapi prompta girmemeli");

  // ---- clipMiddle: bas ve son korunmali ----
  const clipped = verify.clipMiddle("BAS" + "x".repeat(5000) + "SON", 200);
  assert.ok(clipped.length < 400, "uzun cikti kirpilmali");
  assert.match(clipped, /^BAS/, "bas korunmali");
  assert.match(clipped, /SON$/, "son korunmali (test ozetleri sondadir)");

  // ---- store.normalizeConfig verify semasini garanti etmeli ----
  const cfg = store.normalizeConfig({ agents: {}, operator: { cli: "codex" } });
  assert.ok(cfg.verify && Array.isArray(cfg.verify.commands), "normalizeConfig verify semasini eklemeli");
  assert.deepEqual(cfg.verify.commands, [], "eski config yukseltilince kapi KAPALI kalmali (davranis degismez)");
  assert.deepEqual(store.normalizeConfig(cfg), cfg, "verify ile birlikte normalizeConfig idempotent kalmali");
  const dirty = store.normalizeConfig({ agents: {}, operator: { cli: "codex" }, verify: { commands: ["  a  ", 5, ""], timeoutSeconds: -1, maxAttempts: "x" } });
  assert.deepEqual(dirty.verify.commands, ["a", "5"], "gecersiz komut girdileri temizlenmeli");
  assert.equal(dirty.verify.timeoutSeconds, 600, "gecersiz timeout varsayilana dusmeli");
  assert.equal(dirty.verify.maxAttempts, 2, "gecersiz maxAttempts varsayilana dusmeli");

  // ---- engine.verifyStillBlocking: kirmizi kapi teslimati sinirli sayida engeller ----
  const redReport = { ok: false, skipped: false, failed: { command: "npm test", exitCode: 1 } };
  const cfgBlock = { verify: { commands: ["npm test"], maxAttempts: 2, blockOnFailure: true } };
  assert.equal(engine.verifyStillBlocking(cfgBlock, { verify: redReport, verifyAttempts: 1 }), true, "ilk kirmizi kapi teslimati engellemeli");
  assert.equal(engine.verifyStillBlocking(cfgBlock, { verify: redReport, verifyAttempts: 2 }), false, "maxAttempts dolunca engellemeyi birakmali (teslimat > mukemmeliyet)");
  assert.equal(engine.verifyStillBlocking({ verify: { commands: ["npm test"], blockOnFailure: false } }, { verify: redReport, verifyAttempts: 1 }), false, "blockOnFailure:false teslimati engellememeli");
  assert.equal(engine.verifyStillBlocking(cfgBlock, { verify: { ok: true } , verifyAttempts: 1 }), false, "yesil kapi engellememeli");
  assert.equal(engine.verifyStillBlocking(cfgBlock, {}), false, "kapi hic kosmadiysa engellememeli");

  // ---- engine.verifyWarnings: kirmizi kapi teslimatta yuksek sesle gorunmeli ----
  const warnings = engine.verifyWarnings({ verify: redReport });
  assert.equal(warnings.length, 1, "kirmizi kapi tek bir uyari satiri uretmeli");
  assert.match(warnings[0], /DOGRULAMA BASARISIZ/, "uyari net olmali");
  assert.match(warnings[0], /npm test/, "uyari basarisiz komutu adlandirmali");
  assert.deepEqual(engine.verifyWarnings({ verify: { ok: true } }), [], "yesil kapi uyari uretmemeli");
  assert.deepEqual(engine.verifyWarnings({}), [], "kapi kosmadiysa uyari uretmemeli");

  // ---- runVerifyGate sayaci: yalnizca KIRMIZI kapi engelleme hakki tuketmeli ----
  // Regresyon: yesil kapi da sayaci ilerletirse (1. tur yesil → 2. tur kirmizi) maxAttempts
  // dolmus sayilir ve kapi sessizce islevsiz kalir.
  engine._cwd = WORK;
  engine._snapBefore = null; // degisiklik kontrolunu atla; burada sayilan sey sayac
  const counterCfg = { verify: { commands: [`node -e "process.exit(0)"`], timeoutSeconds: 60, maxAttempts: 2, blockOnFailure: true } };
  const counterState = {};
  const greenGate = await engine.runVerifyGate({ id: null }, counterCfg, counterState);
  assert.equal(greenGate.ok, true, "yesil kapi ok donmeli");
  assert.equal(counterState.verifyAttempts || 0, 0, "yesil kapi engelleme hakki tuketmemeli");
  const redGate = await engine.runVerifyGate({ id: null }, { verify: { ...counterCfg.verify, commands: [`node -e "process.exit(1)"`] } }, counterState);
  assert.equal(redGate.ok, false, "kirmizi kapi basarisiz donmeli");
  assert.equal(counterState.verifyAttempts, 1, "kirmizi kapi sayaci bir arttirmali");
  assert.equal(engine.verifyStillBlocking(counterCfg, counterState), true, "yesil turdan sonra gelen kirmizi kapi hala engelleyebilmeli");
  // Komut yoksa kapi hic kosmamali (opt-in sozlesmesi).
  const offGate = await engine.runVerifyGate({ id: null }, { verify: { commands: [] } }, {});
  assert.equal(offGate.skipped, true, "komut yoksa kapi atlanmali");
  assert.equal(offGate.reason, "disabled");
  engine._cwd = null;

  // ---- UCTAN UCA: kapinin motordaki BAGLANTISI ----
  // Birim testler kurallari dogrular; asil risk kapinin tamamlama kestirmelerini gercekten
  // bastirip bastirmadigidir. Sahte CLI ile iki senaryo kosulur: yesil kapi (hizli yol calisir)
  // ve kirmizi kapi (hizli yol bastirilir, karar operatore gider, teslimat uyarili kapanir).
  store.ensureDirs();
  store.loadConfig(); // config.json + roles/ seed
  const fakeAgent = process.platform === "win32"
    ? { cmd: path.join(__dirname, "fake-team-cli.cmd"), args: [], timeoutSeconds: 30 }
    : { cmd: process.execPath, args: [path.join(__dirname, "fake-cli.js")], timeoutSeconds: 30 };
  const e2eWork = { green: path.join(__dirname, ".tmp-verify-green"), red: path.join(__dirname, ".tmp-verify-red") };
  for (const dir of Object.values(e2eWork)) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {}
    fs.mkdirSync(dir, { recursive: true });
  }
  const baseConfig = (workDir, commands, maxAttempts) => ({
    ...store.loadConfig(),
    approvalMode: "auto",
    autonomousConsentAcceptedAt: new Date().toISOString(),
    workingDir: workDir,
    dailyCallBudget: 10000,
    projectContext: false,
    versioning: false,
    operator: { cli: "operator", cmd: fakeAgent.cmd, args: fakeAgent.args, timeoutSeconds: fakeAgent.timeoutSeconds, roleFile: "roles/operator.md", maxRounds: 2, maxDelegationsPerRound: 3 },
    agents: { worker: { ...fakeAgent, description: "test worker", capabilities: ["implementation"], roleFile: "roles/executor.md" } },
    verify: { enabled: true, commands, timeoutSeconds: 60, maxOutputChars: 2000, blockOnFailure: true, maxAttempts },
  });

  // (A) YESIL KAPI — fast modda hizli yol calismaya devam etmeli, kanit teslimata gecmeli.
  store.saveConfig(baseConfig(e2eWork.green, [`node -e "console.log('TESTLER GECTI')"`], 2));
  delete require.cache[require.resolve("../src/engine")];
  const engineGreen = require("../src/engine");
  const greenTask = store.addTask("Yesil kapi dogrulama testi: bir dosya olustur.", e2eWork.green, "operator", "fast");
  engineGreen.running = true;
  await engineGreen.runTask(greenTask);
  engineGreen.running = false;
  const green = store.findTask(greenTask.id);
  assert.equal(green.state, "done", "yesil kapida gorev tamamlanmali");
  assert.ok(green.task.delivery.verify, "teslimat yapilandirilmis kapi raporu tasimali");
  assert.equal(green.task.delivery.verify.ok, true, "yesil kapi ok:true raporlamali");
  assert.match(green.task.delivery.verification, /Dogrulama kapisi GECTI/, "verification alani CALISTIRILAN kaniti tasimali");
  assert.ok(!green.task.delivery.warnings, "yesil kapida dogrulama uyarisi olmamali");
  const greenEvents = store.listRunEvents(greenTask.id);
  assert.ok(greenEvents.some((e) => e.type === "log" && /ikinci operator/.test(e.msg || "")), "yesil kapida FAST hizli yolu korunmali");
  assert.ok(greenEvents.some((e) => e.type === "log" && /Dogrulama .*GECTI/.test(e.msg || "")), "kapi sonucu canli akisa yazilmali");

  // (B) KIRMIZI KAPI — hizli yol bastirilmali, teslimat yuksek sesli uyariyla kapanmali.
  // maxAttempts:1 → motor duzeltme turu istemez; tek turda deterministik sonuc.
  store.saveConfig(baseConfig(e2eWork.red, [`node -e "console.error('TEST BASARISIZ: beklenen 2, gelen 3'); process.exit(1)"`], 1));
  delete require.cache[require.resolve("../src/engine")];
  const engineRed = require("../src/engine");
  const redTask = store.addTask("Kirmizi kapi dogrulama testi: bir dosya olustur.", e2eWork.red, "operator", "fast");
  engineRed.running = true;
  await engineRed.runTask(redTask);
  engineRed.running = false;
  const red = store.findTask(redTask.id);
  assert.equal(red.state, "done", "kirmizi kapi isi cope atmamali; uyarili teslimat yapilmali");
  assert.equal(red.task.delivery.verify.ok, false, "kirmizi kapi ok:false raporlamali");
  assert.equal(red.task.delivery.verify.results[0].exitCode, 1, "basarisiz komutun cikis kodu saklanmali");
  assert.match(red.task.delivery.verify.results[0].output, /TEST BASARISIZ/, "basarisiz komut ciktisi kanit olarak saklanmali");
  assert.ok(Array.isArray(red.task.delivery.warnings), "kirmizi kapi teslimat uyarisi uretmeli");
  assert.ok(red.task.delivery.warnings.some((w) => /DOGRULAMA BASARISIZ/.test(w)), "uyari net olmali");
  const redEvents = store.listRunEvents(redTask.id);
  assert.ok(!redEvents.some((e) => e.type === "log" && /ikinci operator/.test(e.msg || "")), "kirmizi kapi FAST hizli yolunu BASTIRMALI");
  assert.ok(redEvents.some((e) => e.type === "log" && /kestirmeleri atlandi/.test(e.msg || "")), "kestirmelerin atlandigi kullaniciya bildirilmeli");
  // Kapi kirmizi oldugu icin operator ikinci kez cagrilmali (hizli yol atlandi).
  assert.equal(redEvents.filter((e) => e.type === "activity" && e.kind === "process.started").length, 3, "kirmizi kapida operator karari icin ek CLI cagrisi yapilmali (plan + uzman + karar)");

  for (const dir of Object.values(e2eWork)) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {}
  }

  console.log("verify ok");
}

main()
  .then(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.rmSync(WORK, { recursive: true, force: true });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
