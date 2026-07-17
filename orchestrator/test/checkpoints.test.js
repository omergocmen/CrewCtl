const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
// Izole ROOT: checkpoints CP_ROOT'u store.ROOT altindadir; canli runtime'a dokunmayalim.
const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "cli-team-cp-root-"));
process.env.CLI_TEAM_ROOT = TEST_ROOT;
const checkpoints = require("../src/checkpoints");

const read = (p) => fs.readFileSync(p, "utf8");

function main() {
  // Calisma klasoru ROOT'tan BAGIMSIZ ayri bir gecici dizin (checkpoint deposu icine girmesin).
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "cli-team-cp-ws-"));
  try {
    fs.writeFileSync(path.join(ws, "a.js"), "const a=1;\n");
    fs.mkdirSync(path.join(ws, "sub"), { recursive: true });
    fs.writeFileSync(path.join(ws, "sub", "b.js"), "export const b=2;\n");
    fs.writeFileSync(path.join(ws, "keep.txt"), "sabit\n");

    const cp = checkpoints.createCheckpoint(ws, { taskId: "t1", label: "ilk", kind: "pre-task" });
    assert.equal(cp.ok, true, "checkpoint olusmali");
    assert.equal(cp.fileCount, 3, "3 dosya yedeklenmeli");
    assert.ok(cp.id);

    // Ajan "kodu bozar": a.js degistir, sub/b.js sil, yeni c.js ekle. keep.txt sabit.
    fs.writeFileSync(path.join(ws, "a.js"), "const a=999; // bozuldu\n");
    fs.rmSync(path.join(ws, "sub", "b.js"));
    fs.writeFileSync(path.join(ws, "c.js"), "yeni dosya\n");

    const res = checkpoints.restoreCheckpoint(cp.id);
    assert.equal(res.ok, true, "restore basarili olmali");
    assert.ok(res.redoId, "geri alma oncesi redo surumu olusmali");
    assert.equal(read(path.join(ws, "a.js")), "const a=1;\n", "degisen dosya eski haline donmeli");
    assert.equal(read(path.join(ws, "sub", "b.js")), "export const b=2;\n", "silinen dosya geri gelmeli");
    assert.equal(fs.existsSync(path.join(ws, "c.js")), false, "sonradan olusan dosya silinmeli");
    assert.equal(read(path.join(ws, "keep.txt")), "sabit\n", "degismemis dosya korunmali");
    assert.equal(res.deleted, 1, "yalnizca sonradan olusan dosya silinmeli");
    assert.ok(res.restored >= 3);

    // Redo: geri almayi geri al → bozuk hal geri gelmeli (hicbir sey kaybolmaz).
    const redo = checkpoints.restoreCheckpoint(res.redoId);
    assert.equal(redo.ok, true);
    assert.equal(read(path.join(ws, "a.js")), "const a=999; // bozuldu\n", "redo bozuk hali geri getirmeli");
    assert.equal(fs.existsSync(path.join(ws, "c.js")), true, "redo sonradan olusan dosyayi geri getirmeli");

    // Yol guvenligi: cwd disina yazim engellenmeli.
    const { within } = checkpoints._internals;
    assert.equal(within(ws, "../escape.js"), null, "path traversal engellenmeli");
    assert.equal(within(ws, "sub/../../escape.js"), null, "iç içe traversal engellenmeli");
    assert.ok(within(ws, "ok.js"), "klasor ici yol kabul edilmeli");

    // Retention: kucuk retention ile eski surumler budanmali.
    for (let i = 0; i < 5; i++) checkpoints.createCheckpoint(ws, { taskId: `r${i}`, retention: 3 });
    assert.ok(checkpoints.listCheckpoints(ws).length <= 3, "retention limiti uygulanmali");

    // Guard: olmayan surum sessizce hata doner, patlamaz.
    assert.equal(checkpoints.restoreCheckpoint("cp-yok").ok, false);

    console.log("checkpoints ok");
  } finally {
    try { fs.rmSync(ws, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {}
    try { fs.rmSync(TEST_ROOT, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {}
  }
}

main();
