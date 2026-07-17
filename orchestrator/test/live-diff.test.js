const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
// Testi canli runtime'dan izole et: store'u require etmeden ONCE kendi gecici ROOT'unu ayarla.
const REAL_ROOT = path.join(__dirname, "..");
const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "cli-team-livediff-"));
process.env.CLI_TEAM_ROOT = TEST_ROOT;
fs.mkdirSync(path.join(TEST_ROOT, "roles"), { recursive: true });
fs.copyFileSync(path.join(REAL_ROOT, "config.default.json"), path.join(TEST_ROOT, "config.default.json"));
const store = require("../src/store");
const engine = require("../src/engine");

function main() {
  store.ensureDirs();
  store.loadConfig();
  const { snapshotDir, captureTextSnapshot, buildLineDiff, isSensitiveDiffPath } = engine._internals;
  const workspace = path.join(TEST_ROOT, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const taskId = "livediff-test-1";
  try {
    // Gorev BASINDA zaten var olan bir dosya: "modified" ancak tabanda bulunan dosya icin gorunur.
    fs.writeFileSync(path.join(workspace, "existing.js") , "const a = 1;\nconst b = 2;\n");
    // Motoru gorev-ici duruma getir: calisma klasoru ve taban goruntusu.
    engine._cwd = workspace;
    engine._snapBefore = snapshotDir(workspace);
    engine._textBefore = captureTextSnapshot(workspace, engine._snapBefore);
    engine.current = { id: taskId };
    engine._lastFileChangeKey = "";

    // Henuz degisiklik yok -> olay yayinlanmamali.
    assert.equal(engine.publishFileChanges(taskId), null, "degisiklik yokken filechange yayinlanmamali");

    // Yeni dosya olustur -> created olayi.
    const emitted = [];
    engine.on("filechange", (event) => emitted.push(event));
    fs.writeFileSync(path.join(workspace, "app.js"), "console.log(1)");
    const created = engine.publishFileChanges(taskId);
    assert.ok(created, "yeni dosyada filechange yayinlanmali");
    assert.equal(created.type, "filechange");
    assert.equal(created.files.length, 1);
    assert.equal(created.files[0].path, "app.js");
    assert.equal(created.files[0].action, "created");
    assert.equal(created.files[0].additions, 1);
    assert.equal(created.files[0].deletions, 0);
    assert.ok(created.files[0].hunks[0].lines.some((line) => line.type === "add" && line.text === "console.log(1)"));
    assert.equal(created.counts.created, 1);
    assert.equal(created.lineCounts.additions, 1);
    assert.equal(created.taskId, taskId);
    assert.equal(emitted.length, 1, "SSE dinleyicisine tam olarak bir olay ulasmali");

    // Ayni durum tekrar -> tekilleştirme, yeni olay yok.
    assert.equal(engine.publishFileChanges(taskId), null, "ayni diff tekrar yayinlanmamali");
    assert.equal(emitted.length, 1);

    // Ayni dosya yeniden yazilirsa dosya listesi degismese de yeni satir diff'i yayinlanmali.
    fs.writeFileSync(path.join(workspace, "app.js"), "console.log(1);\nconsole.log(2);\n");
    const rewritten = engine.publishFileChanges(taskId);
    assert.ok(rewritten, "ayni dosyanin sonraki icerik degisikligi yayinlanmali");
    assert.equal(rewritten.files[0].additions, 2);
    assert.equal(emitted.length, 2);

    // Yalnizca yeni dosya geri alinirsa workspace tabana doner ve UI temizleme olayi gelir.
    fs.rmSync(path.join(workspace, "app.js"));
    const reverted = engine.publishFileChanges(taskId);
    assert.ok(reverted);
    assert.deepEqual(reverted.files, []);
    assert.deepEqual(reverted.counts, { created: 0, modified: 0, deleted: 0 });
    fs.writeFileSync(path.join(workspace, "app.js"), "console.log(1);\nconsole.log(2);\n");
    assert.ok(engine.publishFileChanges(taskId), "geri alinan dosya yeniden olusturulunca yayinlanmali");

    // Tabandaki dosyayi degistir (farkli boyut) + yeni dosya ekle -> modified + created.
    // app.js gorev sirasinda olusturuldugu icin tabana gore hala "created" kalir.
    fs.writeFileSync(path.join(workspace, "existing.js"), "const a = 1;\nconst b = 300;\n");
    fs.writeFileSync(path.join(workspace, "util.js"), "module.exports = {};");
    const changed = engine.publishFileChanges(taskId);
    assert.ok(changed, "icerik degisince yeni olay yayinlanmali");
    assert.deepEqual(
      changed.files.map(({ path, action }) => ({ path, action })).sort((a, b) => a.path.localeCompare(b.path)),
      [{ path: "app.js", action: "created" }, { path: "existing.js", action: "modified" }, { path: "util.js", action: "created" }]
    );
    assert.equal(changed.counts.created, 2);
    assert.equal(changed.counts.modified, 1);
    const existing = changed.files.find((file) => file.path === "existing.js");
    assert.equal(existing.additions, 1);
    assert.equal(existing.deletions, 1);
    assert.ok(existing.hunks.some((hunk) => hunk.lines.some((line) => line.type === "delete" && line.text === "const b = 2;")));
    assert.ok(existing.hunks.some((hunk) => hunk.lines.some((line) => line.type === "add" && line.text === "const b = 300;")));

    // Hassas dosyanin adi gorunur, icerigi event/store/UI payload'ina girmez.
    fs.writeFileSync(path.join(workspace, ".env"), "API_KEY=super-secret-value\n");
    const secret = engine.publishFileChanges(taskId);
    const envFile = secret.files.find((file) => file.path === ".env");
    assert.ok(envFile);
    assert.equal(envFile.previewStatus, "redacted");
    assert.equal(envFile.additions, null);
    assert.equal(JSON.stringify(secret).includes("super-secret-value"), false);
    assert.equal(isSensitiveDiffPath("nested/.env.production"), true);

    // Silinen metin dosyasi gorev baslangici icerigini eksi satirlar olarak gosterir.
    fs.rmSync(path.join(workspace, "existing.js"));
    const removed = engine.publishFileChanges(taskId);
    const deleted = removed.files.find((file) => file.path === "existing.js");
    assert.equal(deleted.action, "deleted");
    assert.equal(deleted.additions, 0);
    assert.equal(deleted.deletions, 2);
    assert.ok(deleted.hunks[0].lines.every((line) => line.type === "delete"));

    // Saf diff kurali: degisen satirlar ve hunk koordinatlari Git-benzeri bicimde uretilir.
    const direct = buildLineDiff("a\nb\nc\n", "a\nB\nc\nd\n");
    assert.equal(direct.additions, 2);
    assert.equal(direct.deletions, 1);
    assert.equal(direct.hunks.length, 1);
    assert.ok(direct.hunks[0].lines.some((line) => line.type === "context"));

    // Kalici calisma olaylarina da yazilmis olmali (replay/timeline icin).
    const events = store.listRunEvents(taskId);
    assert.equal(events.filter((e) => e.type === "filechange").length, 7, "tum farkli filechange durumlari kaydedilmeli");

    // Guard: _cwd/_snapBefore yoksa sessizce null.
    const savedCwd = engine._cwd;
    engine._cwd = "";
    assert.equal(engine.publishFileChanges(taskId), null, "_cwd yokken guard null donmeli");
    engine._cwd = savedCwd;

    // Bayrak: liveDiff=false iken startLiveDiff zamanlayici kurmamali.
    const cfg = store.loadConfig();
    cfg.liveDiff = false;
    store.saveConfig(cfg);
    engine.startLiveDiff({ id: taskId });
    assert.equal(engine._liveTimer, null, "liveDiff=false iken zamanlayici kurulmamali");

    // Bayrak acikken zamanlayici kurulmali; ardindan temizlenebilmeli.
    cfg.liveDiff = true;
    store.saveConfig(cfg);
    engine.startLiveDiff({ id: taskId });
    assert.ok(engine._liveTimer, "liveDiff acikken zamanlayici kurulmali");
    engine.stopLiveDiff();
    assert.equal(engine._liveTimer, null, "stopLiveDiff zamanlayiciyi temizlemeli");

    console.log("live diff ok");
  } finally {
    engine.stopLiveDiff();
    engine.removeAllListeners("filechange");
    engine._cwd = null;
    engine._snapBefore = null;
    engine._textBefore = null;
    engine.current = null;
    try { fs.rmSync(TEST_ROOT, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {}
  }
}

main();
