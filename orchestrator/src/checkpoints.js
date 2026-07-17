// checkpoints.js — gorev-basi otomatik surumleme (sifir bagimlilik).
// Her gorev CALISMADAN ONCE calisma klasorunun bir surumu (checkpoint) alinir; ajan kodu
// bozarsa tek tikla o surume donulur. Depolama daima birebir dosya KOPYASIDIR (deterministik,
// git durumundan bagimsiz, geri-alinabilir). "git-farkinda": klasor bir git deposuysa hangi
// dosyalarin yedeklenecegi `git ls-files` ile belirlenir (boylece .gitignore'a uyulur ve
// build ciktilari/gecici dosyalar surume girmez); depoysa degilse guvenli bir walk kullanilir.
// NOT: fs.cpSync Windows'ta non-ASCII yollarda (or. C:\Users\Ömer) cokebiliyor; tum kopyalar
// Unicode-guvenli fs.copyFileSync ile yapilir.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const store = require("./store");

const isWin = process.platform === "win32";
const CP_ROOT = path.join(store.ROOT, "state", "checkpoints");
const MAX_FILES = 5000;            // Bundan buyuk klasorlerde surum alma (guvenlik/performans).
const MAX_BYTES = 200 * 1024 * 1024;
const DEFAULT_RETENTION = 20;

// snapshotDir (engine) ile AYNI ignore mantigi: node_modules/.git ve orkestratorun kendi
// runtime durumu (queue/state/memory) surume girmemeli — aksi halde checkpoint kendi icine
// kopyalanip sisebilir.
function ignored(rel) {
  const r = String(rel).replace(/\\/g, "/");
  return r.includes("node_modules") || r.includes(".git/") || r === ".git" || r.startsWith(".git/") ||
    r.startsWith("orchestrator/queue") || r.startsWith("orchestrator/state") ||
    r.startsWith("orchestrator/memory") || r.startsWith("orchestrator/node_modules");
}

function isGitRepo(cwd) {
  try {
    const r = spawnSync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8", timeout: 8000, windowsHide: true, shell: isWin,
    });
    return r.status === 0 && /true/i.test(String(r.stdout || ""));
  } catch { return false; }
}

// Tracked + izlenmeyen ama .gitignore'da olmayan dosyalar; NUL ayrac unicode/bosluk-guvenli.
function gitFileList(cwd) {
  try {
    const r = spawnSync("git", ["-C", cwd, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      encoding: "utf8", timeout: 20000, maxBuffer: 64 * 1024 * 1024, windowsHide: true, shell: isWin,
    });
    if (r.status !== 0) return null;
    return String(r.stdout || "").split("\0").filter(Boolean);
  } catch { return null; }
}

function walkFileList(cwd) {
  const out = [];
  let count = 0;
  const walk = (abs, rel) => {
    if (count > MAX_FILES + 1) return;
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (ignored(childRel)) continue;
      if (entry.isSymbolicLink()) continue; // Sembolik baglantilari izleme (klasor disina cikmasin).
      const childAbs = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(childAbs, childRel);
      else { out.push(childRel); count++; }
    }
  };
  walk(cwd, "");
  return out;
}

// Yedeklenecek dosya listesi (calisma klasorune GORE goreli yollar).
function fileList(cwd) {
  if (isGitRepo(cwd)) {
    const git = gitFileList(cwd);
    // Bos liste (or. calisma klasoru gitignore'da) walk'a duser; aksi halde surum bos kalir
    // ve restore hicbir sey yapamaz. Dolu liste .gitignore'a uyan git-farkinda yoldur.
    if (git && git.length) return { files: git.filter((rel) => !ignored(rel)), backend: "git" };
  }
  return { files: walkFileList(cwd), backend: "copy" };
}

// Yol guvenligi: hedef daima cwd icinde kalmali (path traversal / sembolik kacis engeli).
function within(root, rel) {
  const base = path.resolve(root);
  const target = path.resolve(base, rel);
  return target === base || target.startsWith(base + path.sep) ? target : null;
}

function ensureRoot() { fs.mkdirSync(CP_ROOT, { recursive: true }); }

function readManifest(id) {
  try { return JSON.parse(fs.readFileSync(path.join(CP_ROOT, path.basename(String(id)), "manifest.json"), "utf8")); }
  catch { return null; }
}

function enforceRetention(cwd, retention) {
  const keep = Math.max(1, Number(retention) || DEFAULT_RETENTION);
  try {
    const mine = fs.readdirSync(CP_ROOT)
      .map(readManifest).filter((m) => m && path.resolve(m.cwd) === path.resolve(cwd))
      .sort((a, b) => (a.at < b.at ? 1 : -1));
    for (const m of mine.slice(keep)) {
      try { fs.rmSync(path.join(CP_ROOT, m.id), { recursive: true, force: true }); } catch {}
    }
  } catch {}
}

// Calisma klasorunun mevcut halinden bir surum (checkpoint) olusturur. Basarisiz/atlanmis
// durumda gorevi ASLA oldurmez; {ok:false,...} doner ve cagiran log'lar.
function createCheckpoint(cwd, meta = {}) {
  try {
    ensureRoot();
    const resolvedCwd = path.resolve(cwd);
    if (!fs.existsSync(resolvedCwd)) return { ok: false, skipped: true, reason: "Calisma klasoru bulunamadi." };
    const { files, backend } = fileList(resolvedCwd);
    if (files.length > MAX_FILES) return { ok: false, skipped: true, reason: `Klasor cok buyuk (${files.length} dosya > ${MAX_FILES}); surum alinmadi.` };
    const id = `cp-${new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 17)}-${Math.random().toString(36).slice(2, 7)}`;
    const dir = path.join(CP_ROOT, id);
    const filesDir = path.join(dir, "files");
    fs.mkdirSync(filesDir, { recursive: true });
    const stored = [];
    let bytes = 0;
    for (const rel of files) {
      const src = within(resolvedCwd, rel);
      if (!src) continue;
      let st;
      try { st = fs.lstatSync(src); } catch { continue; }
      if (!st.isFile()) continue; // Sembolik baglanti / klasor / silinmis izlenen dosyayi atla.
      bytes += st.size;
      if (bytes > MAX_BYTES) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} return { ok: false, skipped: true, reason: `Klasor cok buyuk (>${Math.round(MAX_BYTES / 1048576)}MB); surum alinmadi.` }; }
      const dest = path.join(filesDir, rel);
      try { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); stored.push(rel); } catch {}
    }
    const manifest = {
      id, at: new Date().toISOString(), cwd: resolvedCwd, backend,
      fileCount: stored.length, bytes, files: stored,
      taskId: meta.taskId || null, label: String(meta.label || "").slice(0, 300), kind: meta.kind || "pre-task",
    };
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
    enforceRetention(resolvedCwd, meta.retention);
    return { ok: true, ...manifest };
  } catch (error) { return { ok: false, error: error.message }; }
}

// Bir surumu geri yukler. Once MEVCUT hali de bir surum yapar (redo guvenligi), sonra:
// (1) surumden SONRA olusan dosyalari siler, (2) surumdeki dosyalari geri yazar.
function restoreCheckpoint(id, opts = {}) {
  const manifest = readManifest(id);
  if (!manifest) return { ok: false, error: "Surum bulunamadi." };
  const cwd = path.resolve(manifest.cwd);
  if (!fs.existsSync(cwd)) return { ok: false, error: "Calisma klasoru bulunamadi." };
  let redoId = null;
  if (opts.createRedo !== false) {
    const redo = createCheckpoint(cwd, { taskId: manifest.taskId, kind: "pre-restore", label: `Geri alma oncesi (${manifest.id})`, retention: opts.retention });
    if (redo.ok) redoId = redo.id;
  }
  const filesDir = path.join(CP_ROOT, path.basename(String(id)), "files");
  const keep = new Set(manifest.files);
  // (1) Surumden sonra olusturulmus (surumde olmayan) dosyalari sil.
  let deleted = 0;
  for (const rel of fileList(cwd).files) {
    if (keep.has(rel)) continue;
    const target = within(cwd, rel);
    if (!target) continue;
    try { if (fs.existsSync(target)) { fs.rmSync(target, { force: true }); deleted++; } } catch {}
  }
  // (2) Surumdeki dosyalari birebir geri yaz.
  let restored = 0;
  for (const rel of manifest.files) {
    const src = path.join(filesDir, rel);
    const dest = within(cwd, rel);
    if (!dest) continue;
    try { if (!fs.existsSync(src)) continue; fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); restored++; } catch {}
  }
  return { ok: true, id: manifest.id, cwd, restored, deleted, redoId };
}

// Listeleme: dosya listesini disari vermeden ozet meta doner (istege bagli cwd filtresi).
function listCheckpoints(cwd) {
  try {
    ensureRoot();
    const all = fs.readdirSync(CP_ROOT).map(readManifest).filter(Boolean);
    const filtered = cwd ? all.filter((m) => path.resolve(m.cwd) === path.resolve(cwd)) : all;
    return filtered.sort((a, b) => (a.at < b.at ? 1 : -1)).map(({ files, ...rest }) => rest);
  } catch { return []; }
}

module.exports = { CP_ROOT, createCheckpoint, restoreCheckpoint, listCheckpoints, readManifest, fileList, isGitRepo, _internals: { ignored, within, walkFileList } };
