const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const isWin = process.platform === "win32";

function runGit(args, cwd) {
  try {
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true,
      shell: false,
    });
    return {
      status: result.status,
      stdout: String(result.stdout || "").trim(),
      stderr: String(result.stderr || "").trim(),
    };
  } catch (error) {
    return { status: -1, stdout: "", stderr: error.message };
  }
}

function isGitRepo(dir) {
  if (!dir || typeof dir !== "string") return false;
  const res = runGit(["rev-parse", "--is-inside-work-tree"], dir);
  return res.status === 0 && res.stdout === "true";
}

function getRepoRoot(dir) {
  if (!dir || typeof dir !== "string") return null;
  const res = runGit(["rev-parse", "--show-toplevel"], dir);
  if (res.status !== 0 || !res.stdout) return null;
  return path.resolve(res.stdout);
}

function getCurrentBranch(repoRoot) {
  const res = runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  if (res.status === 0 && res.stdout && res.stdout !== "HEAD") return res.stdout;
  return "main";
}

function prepareWorktree(targetDir, taskId) {
  const root = getRepoRoot(targetDir);
  if (!root) {
    return { ok: false, reason: "Hedef dizin bir Git deposu değil.", path: targetDir, isWorktree: false };
  }
  const cleanTaskId = String(taskId || `task-${Date.now()}`).replace(/[^a-zA-Z0-9_.-]/g, "-");
  const worktreeDir = path.join(root, ".crewctl", "worktrees", cleanTaskId);
  const branchName = `crewctl/${cleanTaskId}`;

  try {
    fs.mkdirSync(path.dirname(worktreeDir), { recursive: true });
  } catch {}

  // Temiz bir branch ve worktree oluştur
  runGit(["worktree", "prune"], root);
  if (fs.existsSync(worktreeDir)) {
    runGit(["worktree", "remove", "--force", worktreeDir], root);
  }
  runGit(["branch", "-D", branchName], root);

  const currentBranch = getCurrentBranch(root);
  const res = runGit(["worktree", "add", "-b", branchName, worktreeDir, currentBranch], root);

  if (res.status !== 0) {
    return {
      ok: false,
      reason: `Worktree oluşturulamadı: ${res.stderr || res.stdout || "Bilinmeyen git hatası"}`,
      path: targetDir,
      isWorktree: false,
    };
  }

  return {
    ok: true,
    repoRoot: root,
    path: worktreeDir,
    branch: branchName,
    parentBranch: currentBranch,
    isWorktree: true,
  };
}

function mergeWorktree(worktreeMeta) {
  if (!worktreeMeta || !worktreeMeta.isWorktree || !worktreeMeta.repoRoot || !worktreeMeta.branch) {
    return { ok: false, error: "Geçersiz worktree metadata nesnesi." };
  }
  const { repoRoot, branch, parentBranch, path: wtPath } = worktreeMeta;

  // Önce worktree içindeki değişiklikleri commit et (varsa)
  runGit(["add", "."], wtPath);
  runGit(["commit", "-m", `feat(crewctl): automated task delivery (${branch})`], wtPath);

  // Ana depoda birleştir
  const mergeRes = runGit(["merge", "--no-ff", branch, "-m", `Merge branch '${branch}' into ${parentBranch}`], repoRoot);
  if (mergeRes.status !== 0) {
    return {
      ok: false,
      error: `Ana dala birleştirme başarısız (çakışma olabilir): ${mergeRes.stderr || mergeRes.stdout}`,
    };
  }

  // Worktree ve geçici dalı temizle
  cleanupWorktree(worktreeMeta);
  return { ok: true, mergedBranch: branch };
}

function cleanupWorktree(worktreeMeta) {
  if (!worktreeMeta || !worktreeMeta.isWorktree || !worktreeMeta.repoRoot) return;
  const { repoRoot, branch, path: wtPath } = worktreeMeta;
  if (wtPath && fs.existsSync(wtPath)) {
    runGit(["worktree", "remove", "--force", wtPath], repoRoot);
  }
  if (branch) {
    runGit(["branch", "-D", branch], repoRoot);
  }
  runGit(["worktree", "prune"], repoRoot);
}

module.exports = {
  isGitRepo,
  getRepoRoot,
  getCurrentBranch,
  prepareWorktree,
  mergeWorktree,
  cleanupWorktree,
};
