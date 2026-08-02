const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { isGitRepo, getRepoRoot, prepareWorktree, mergeWorktree, cleanupWorktree } = require("../src/workspace-isolation");

function main() {
  console.log("Running workspace isolation tests...");

  // Test 1: Current workspace check
  const currentDir = process.cwd();
  const repoCheck = isGitRepo(currentDir);
  assert.strictEqual(repoCheck, true, "Mevcut dizin git deposu olmalı");

  const repoRoot = getRepoRoot(currentDir);
  assert.ok(repoRoot, "Repo kök dizini çözümlenebilmeli");

  // Test 2: Prepare worktree
  const testTaskId = `test-worktree-${Date.now()}`;
  const prep = prepareWorktree(currentDir, testTaskId);
  assert.strictEqual(prep.ok, true, "Worktree hazırlığı başarılı olmalı");
  assert.strictEqual(prep.isWorktree, true, "isWorktree true olmalı");
  assert.ok(fs.existsSync(prep.path), "Worktree klasörü diskte oluşturulmuş olmalı");

  // Test 3: Cleanup worktree
  cleanupWorktree(prep);
  assert.strictEqual(fs.existsSync(prep.path), false, "Temizlik sonrası worktree klasörü silinmiş olmalı");

  console.log("Workspace isolation tests PASSED ✓");
}

if (require.main === module) {
  main();
}

module.exports = { main };
