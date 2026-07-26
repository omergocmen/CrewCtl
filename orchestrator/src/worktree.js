// GOREV-BASI GIT WORKTREE IZOLASYONU (sifir bagimlilik).
// Her gorev, deponun HEAD'inden olusturulan KENDI git worktree'sinde ve KENDI branch'inde
// calisir. Boylece ajanlar ana calisma agacini kirletmez, birden fazla gorev ayni depoda
// birbirine dokunmadan yasayabilir ve teslimat gozden gecirilebilir bir branch olarak kalir.
//
// SINIRLAR (bilincli):
// - Worktree deponun HEAD'inden olusur; **commit edilmemis** yerel degisiklikler ICINDE OLMAZ.
//   Bu yuzden depo kirliyse motor yuksek sesle uyarir (sessizce yanlis is yapmaktan iyidir).
// - Gitignore'lanmis uretilmis dosyalar (node_modules, .env, build) yeni worktree'de YOKTUR.
//   Cozum iki kademeli: `linkPaths` ile agir klasorleri bagla (Windows'ta junction), kalanini
//   `setupCommands` ile kur (or. npm ci).
//
// Worktree'ler kullanicinin deposunu kirletmemek icin CrewCtl'in kendi veri kokune yazilir:
// <ROOT>/state/worktrees/<taskId>.
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const store = require("./store");
const verify = require("./verify");

const isWin = process.platform === "win32";
const WT_ROOT = path.join(store.ROOT, "state", "worktrees");

const DEFAULTS = {
  mode: "off",
  branchPrefix: "crewctl/task-",
  setupCommands: [],
  linkPaths: [],
  commit: true,
  keepOnFailure: true,
  setupTimeoutSeconds: 900,
};

// Saf ve idempotent: loadConfig sicak yoldur.
function normalizeWorktreeConfig(cfg) {
  const src = cfg && typeof cfg === "object" && cfg.worktree && typeof cfg.worktree === "object" ? cfg.worktree : {};
  const list = (value) => (Array.isArray(value) ? value.map((x) => String(x || "").trim()).filter(Boolean) : []);
  const prefix = String(src.branchPrefix || "").trim() || DEFAULTS.branchPrefix;
  const timeout = Number(src.setupTimeoutSeconds);
  return {
    mode: src.mode === "task" ? "task" : "off",
    branchPrefix: prefix,
    setupCommands: list(src.setupCommands),
    // Bagli yollar depo KOKUNE goreli olmali; mutlak yol veya ust dizin kacisi kabul edilmez.
    linkPaths: list(src.linkPaths).filter((rel) => !path.isAbsolute(rel) && !rel.split(/[\\/]/).includes("..")),
    commit: src.commit !== false,
    keepOnFailure: src.keepOnFailure !== false,
    setupTimeoutSeconds: Number.isFinite(timeout) && timeout >= 10 ? timeout : DEFAULTS.setupTimeoutSeconds,
  };
}

function isEnabled(cfg) {
  return normalizeWorktreeConfig(cfg).mode === "task";
}

// DIKKAT: shell KULLANILMAZ. Windows'ta shell:true iken Node argumanlari birlestirir ve
// OTOMATIK TIRNAK KOYMAZ; bosluk iceren commit mesaji ve yollar ikiye bolunur (ayni tuzak
// cli-registry.buildCommand'da belgeli). git PATH'te git.exe olarak cozuldugu icin shell
// gereksizdir ve arguman dizisi oldugu gibi aktarilir.
function git(cwd, args, timeout = 20000) {
  try {
    return spawnSync("git", ["-C", cwd, ...args], {
      encoding: "utf8", timeout, windowsHide: true, shell: false, maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    return { status: 1, stdout: "", stderr: error.message };
  }
}

function isGitRepo(cwd) {
  const r = git(cwd, ["rev-parse", "--is-inside-work-tree"], 8000);
  return r.status === 0 && /true/i.test(String(r.stdout || ""));
}

// HEAD yoksa (henuz commit'i olmayan depo) worktree olusturulamaz.
function hasCommit(cwd) {
  return git(cwd, ["rev-parse", "--verify", "HEAD"], 8000).status === 0;
}

// Deponun kokunu bul: kullanici alt klasoru calisma klasoru secmis olabilir.
function repoRoot(cwd) {
  const r = git(cwd, ["rev-parse", "--show-toplevel"], 8000);
  if (r.status !== 0) return null;
  const out = String(r.stdout || "").trim();
  return out || null;
}

// Commit edilmemis degisiklikler worktree'ye TASINMAZ; cagiran uyarabilsin diye listele.
function dirtyFiles(cwd, limit = 20) {
  const r = git(cwd, ["status", "--porcelain"], 15000);
  if (r.status !== 0) return [];
  return String(r.stdout || "").split("\n").map((l) => l.slice(3).trim()).filter(Boolean).slice(0, limit);
}

function branchExists(cwd, branch) {
  return git(cwd, ["rev-parse", "--verify", `refs/heads/${branch}`], 8000).status === 0;
}

function sanitizeSegment(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[-.]+/, "").slice(0, 60) || "task";
}

// Ayni gorev id'si icin branch varsa (or. onay sonrasi devam) benzersizlestir.
function uniqueBranch(repo, prefix, taskId) {
  const base = `${prefix}${sanitizeSegment(taskId)}`;
  if (!branchExists(repo, base)) return base;
  for (let i = 2; i < 50; i++) {
    const candidate = `${base}-${i}`;
    if (!branchExists(repo, candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// Agir/gitignore'lanmis klasorleri (node_modules gibi) yeni worktree'ye bagla. Windows'ta
// dizinler icin "junction" yonetici hakki GEREKTIRMEZ; sembolik baglanti kurulamazsa sessizce
// atlanir (setupCommands yedegi vardir).
function linkArtifacts(repoDir, wtDir, linkPaths) {
  const linked = [], skipped = [];
  for (const rel of linkPaths) {
    const target = path.join(repoDir, rel);
    const linkPath = path.join(wtDir, rel);
    if (!fs.existsSync(target)) { skipped.push({ rel, reason: "kaynak yok" }); continue; }
    if (fs.existsSync(linkPath)) { skipped.push({ rel, reason: "worktree'de zaten var" }); continue; }
    try {
      fs.mkdirSync(path.dirname(linkPath), { recursive: true });
      const type = fs.statSync(target).isDirectory() ? (isWin ? "junction" : "dir") : "file";
      fs.symlinkSync(target, linkPath, type);
      linked.push(rel);
    } catch (error) {
      skipped.push({ rel, reason: error.code || error.message });
    }
  }
  return { linked, skipped };
}

// Kurulum komutlari (or. npm ci). verify.runVerification ile AYNI kosucu kullanilir: shell,
// zaman asimi, proses agaci sonlandirma ve CI=1 davranisi tek yerde tanimli kalsin.
async function runSetup(wtDir, commands, timeoutSeconds) {
  if (!commands.length) return { ok: true, skipped: true, results: [] };
  return verify.runVerification(commands, {
    cwd: wtDir,
    timeoutMs: Math.max(10, timeoutSeconds) * 1000,
    maxOutputChars: 2000,
  });
}

// Gorev icin worktree olustur. Basarisiz olursa ASLA firlatmaz: { ok:false, reason } doner ve
// cagiran eski davranisa (dogrudan calisma klasorunde calisma) duser.
async function create(taskId, cwd, cfg) {
  const settings = normalizeWorktreeConfig(cfg);
  if (settings.mode !== "task") return { ok: false, reason: "kapali", settings };
  if (!isGitRepo(cwd)) return { ok: false, reason: "calisma klasoru bir git deposu degil", settings };
  const repo = repoRoot(cwd) || cwd;
  if (!hasCommit(repo)) return { ok: false, reason: "deponun henuz commit'i yok (HEAD bulunamadi)", settings };

  const branch = uniqueBranch(repo, settings.branchPrefix, taskId);
  const dir = path.join(WT_ROOT, sanitizeSegment(taskId));
  try { fs.mkdirSync(WT_ROOT, { recursive: true }); } catch {}
  // Ayni yolda eski bir worktree kalintisi varsa temizle (onceki cokme sonrasi).
  if (fs.existsSync(dir)) {
    git(repo, ["worktree", "remove", "--force", dir], 30000);
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {}
  }
  const added = git(repo, ["worktree", "add", "-b", branch, dir, "HEAD"], 120000);
  if (added.status !== 0) {
    return { ok: false, reason: `git worktree add basarisiz: ${String(added.stderr || added.stdout || "").trim().slice(0, 300)}`, settings };
  }

  const links = linkArtifacts(repo, dir, settings.linkPaths);
  const setup = await runSetup(dir, settings.setupCommands, settings.setupTimeoutSeconds);
  return {
    ok: true,
    dir,
    branch,
    repo,
    dirty: dirtyFiles(repo),
    links,
    setup,
    settings,
  };
}

// Worktree'deki tum degisiklikleri branch'e commit'ler. UZAGA HICBIR SEY GONDERMEZ (push/PR yok):
// disa donuk ve geri alinmasi zor islemler kullanicinin karari olmali.
function commit(dir, message) {
  const status = git(dir, ["status", "--porcelain"], 20000);
  if (status.status !== 0) return { committed: false, reason: "git status okunamadi" };
  const changed = String(status.stdout || "").split("\n").filter((l) => l.trim());
  if (!changed.length) return { committed: false, reason: "degisiklik yok", files: 0 };

  const added = git(dir, ["add", "-A"], 60000);
  if (added.status !== 0) return { committed: false, reason: `git add basarisiz: ${String(added.stderr || "").trim().slice(0, 200)}` };
  // -m ile coklu satir: ilk satir ozet, kalani govde. Yazar bilgisi kullanicinin git config'inden gelir.
  const text = String(message || "CrewCtl gorevi").split("\n");
  const args = ["commit", "-m", text[0].slice(0, 200)];
  const body = text.slice(1).join("\n").trim();
  if (body) args.push("-m", body.slice(0, 4000));
  const done = git(dir, args, 60000);
  if (done.status !== 0) {
    const detail = String(done.stderr || done.stdout || "").trim().slice(0, 300);
    return { committed: false, reason: `git commit basarisiz: ${detail}` };
  }
  const sha = String(git(dir, ["rev-parse", "--short", "HEAD"], 8000).stdout || "").trim();
  return { committed: true, sha, files: changed.length };
}

// Worktree'yi kaldir. Branch yalnizca acikca istenirse silinir (commit'li is kaybolmasin).
function remove(repo, dir, branch, deleteBranch = false) {
  if (!repo || !dir) return { removed: false };
  const r = git(repo, ["worktree", "remove", "--force", dir], 60000);
  if (r.status !== 0) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {}
    git(repo, ["worktree", "prune"], 20000);
  }
  let branchDeleted = false;
  if (deleteBranch && branch) branchDeleted = git(repo, ["branch", "-D", branch], 20000).status === 0;
  return { removed: true, branchDeleted };
}

// Worktree'de commit edilmis/edilmemis degisiklik var mi?
function hasWork(dir) {
  const status = git(dir, ["status", "--porcelain"], 20000);
  return status.status === 0 && String(status.stdout || "").trim().length > 0;
}

module.exports = {
  DEFAULTS, WT_ROOT,
  normalizeWorktreeConfig, isEnabled,
  isGitRepo, hasCommit, repoRoot, dirtyFiles, branchExists, sanitizeSegment, uniqueBranch,
  linkArtifacts, runSetup, create, commit, remove, hasWork,
};
