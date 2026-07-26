// Gorev-basi git worktree izolasyonu testleri. GERCEK bir git deposu (gecici klasorde) uzerinde
// calisir; ag erisimi ve uzak depo gerektirmez. Git kurulu degilse test kendini atlar.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "crewctl-wt-"));
process.env.CLI_TEAM_ROOT = ROOT;

const store = require("../src/store");
const worktree = require("../src/worktree");

const isWin = process.platform === "win32";
const cleanup = [ROOT];

// shell:false — bkz. worktree.js: Windows'ta shell:true bosluklu argumanlari boler.
function git(cwd, args) {
  return spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 30000, windowsHide: true, shell: false });
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crewctl-repo-"));
  cleanup.push(dir);
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "CrewCtl Test"]);
  // commit.gpgsign kullanicinin global config'inden gelirse commit sessizce basarisiz olur.
  git(dir, ["config", "commit.gpgsign", "false"]);
  fs.writeFileSync(path.join(dir, "a.txt"), "ilk\n", "utf8");
  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n.crewctl/\n", "utf8");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", "ilk commit"]);
  return dir;
}

async function main() {
  const probe = spawnSync("git", ["--version"], { encoding: "utf8", timeout: 15000, windowsHide: true, shell: false });
  if (probe.status !== 0) {
    console.log("worktree ok (git kurulu degil, atlandi)");
    return;
  }

  // ---- normalizeWorktreeConfig: saf, guvenli varsayilanlar ----
  const empty = worktree.normalizeWorktreeConfig({});
  assert.equal(empty.mode, "off", "worktree varsayilan olarak KAPALI olmali (davranis degismez)");
  assert.equal(empty.commit, true);
  assert.equal(empty.branchPrefix, "crewctl/task-");
  const raw = { worktree: { mode: "task", setupCommands: ["  npm ci  ", ""], linkPaths: ["node_modules", "../gizli", "/etc", "sub/dir"], branchPrefix: "  ", setupTimeoutSeconds: 1 } };
  const snapshot = JSON.stringify(raw);
  const norm = worktree.normalizeWorktreeConfig(raw);
  assert.equal(JSON.stringify(raw), snapshot, "normalize girdiyi degistirmemeli");
  assert.deepEqual(norm.setupCommands, ["npm ci"], "komutlar trim'lenip bos olanlar atilmali");
  assert.deepEqual(norm.linkPaths, ["node_modules", "sub/dir"], "mutlak yol ve '..' kacisi temizlenmeli");
  assert.equal(norm.branchPrefix, "crewctl/task-", "bos prefix varsayilana dusmeli");
  assert.equal(norm.setupTimeoutSeconds, 900, "cok kucuk timeout varsayilana dusmeli");
  assert.deepEqual(worktree.normalizeWorktreeConfig({ worktree: norm }), norm, "normalize idempotent olmali");
  assert.equal(worktree.isEnabled({}), false);
  assert.equal(worktree.isEnabled({ worktree: { mode: "task" } }), true);

  // ---- Git olmayan klasorde ASLA firlatmamali ----
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), "crewctl-plain-"));
  cleanup.push(plain);
  const noGit = await worktree.create("T-x", plain, { worktree: { mode: "task" } });
  assert.equal(noGit.ok, false, "git olmayan klasorde worktree acilmamali");
  assert.match(noGit.reason, /git deposu degil/, "sebep anlasilir olmali");

  // ---- Commit'i olmayan depo ----
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "crewctl-bare-"));
  cleanup.push(bare);
  git(bare, ["init", "-b", "main"]);
  const noHead = await worktree.create("T-y", bare, { worktree: { mode: "task" } });
  assert.equal(noHead.ok, false, "HEAD'i olmayan depoda worktree acilmamali");
  assert.match(noHead.reason, /commit/i);

  // ---- Mutlu yol: izole agac + branch ----
  const repo = makeRepo();
  // Kirli durum: commit edilmemis degisiklik worktree'ye TASINMAMALI ve uyarilmali.
  fs.writeFileSync(path.join(repo, "kirli.txt"), "commit edilmedi\n", "utf8");
  // Baglanacak agir klasor (gitignore'da).
  fs.mkdirSync(path.join(repo, "node_modules", "paket"), { recursive: true });
  fs.writeFileSync(path.join(repo, "node_modules", "paket", "index.js"), "module.exports=1\n", "utf8");

  const cfg = { worktree: { mode: "task", linkPaths: ["node_modules"], setupCommands: [`node -e "require('fs').writeFileSync('kurulum-kaniti.txt','ok')"`] } };
  const created = await worktree.create("202607251713412-1022", repo, cfg);
  assert.equal(created.ok, true, `worktree acilmali: ${created.reason || ""}`);
  assert.equal(created.branch, "crewctl/task-202607251713412-1022", "branch adi gorev id'sinden uretilmeli");
  assert.ok(created.dir.startsWith(path.join(store.ROOT, "state", "worktrees")), "worktree KULLANICI DEPOSUNA degil veri kokune acilmali");
  assert.ok(fs.existsSync(path.join(created.dir, "a.txt")), "HEAD icerigi worktree'de olmali");
  assert.ok(!fs.existsSync(path.join(created.dir, "kirli.txt")), "commit edilmemis dosya worktree'de OLMAMALI");
  assert.ok(created.dirty.includes("kirli.txt"), "kirli dosyalar cagirana bildirilmeli (uyari icin)");
  assert.deepEqual(created.links.linked, ["node_modules"], "linkPaths baglanmali");
  assert.ok(fs.existsSync(path.join(created.dir, "node_modules", "paket", "index.js")), "bagli klasorun icerigi worktree'den gorunmeli");
  assert.equal(created.setup.ok, true, "kurulum komutu calismali");
  assert.ok(fs.existsSync(path.join(created.dir, "kurulum-kaniti.txt")), "kurulum komutu WORKTREE icinde kosmali");

  // Izolasyon: worktree'deki degisiklik ana agaci ETKILEMEMELI.
  fs.writeFileSync(path.join(created.dir, "a.txt"), "ajan degistirdi\n", "utf8");
  fs.writeFileSync(path.join(created.dir, "yeni.txt"), "ajan olusturdu\n", "utf8");
  assert.equal(fs.readFileSync(path.join(repo, "a.txt"), "utf8"), "ilk\n", "ana calisma agaci KIRLENMEMELI");
  assert.ok(!fs.existsSync(path.join(repo, "yeni.txt")), "worktree'de olusan dosya ana agaca sizmamali");

  // ---- Commit: uzaga hicbir sey gitmez, branch'te durur ----
  assert.equal(worktree.hasWork(created.dir), true, "degisiklik varken hasWork true olmali");
  const committed = worktree.commit(created.dir, "CrewCtl: test teslimati\nGorev: T-1022");
  assert.equal(committed.committed, true, `commit basarili olmali: ${committed.reason || ""}`);
  assert.ok(committed.sha && committed.sha.length >= 6, "kisa sha donmeli");
  assert.ok(committed.files >= 2, "degisen dosya sayisi raporlanmali");
  assert.equal(worktree.hasWork(created.dir), false, "commit sonrasi calisma agaci temiz olmali");
  // Commit gercekten BRANCH'e gitti mi ve ana branch'e dokunmadi mi?
  const log = git(repo, ["log", "--oneline", created.branch]).stdout;
  assert.match(log, /test teslimati/, "commit branch'te gorunmeli");
  assert.doesNotMatch(git(repo, ["log", "--oneline", "main"]).stdout, /test teslimati/, "main branch'i ETKILENMEMELI");
  // node_modules bagli oldugu icin commit'e girmemeli (gitignore).
  assert.doesNotMatch(git(repo, ["show", "--stat", "--name-only", created.branch]).stdout, /node_modules/, "bagli/gitignore'lanmis klasor commit'e girmemeli");

  // ---- Degisiklik yoksa commit yapilmaz ----
  const empty2 = worktree.commit(created.dir, "bos");
  assert.equal(empty2.committed, false, "degisiklik yokken commit yapilmamali");
  assert.equal(empty2.reason, "degisiklik yok");

  // ---- Ayni gorev id'si tekrar gelirse branch benzersizlesmeli ----
  const second = await worktree.create("202607251713412-1022", repo, { worktree: { mode: "task" } });
  assert.equal(second.ok, true, "ikinci worktree acilmali");
  assert.notEqual(second.branch, created.branch, "var olan branch adi yeniden kullanilmamali");
  assert.match(second.branch, /-2$/, "benzersizlestirme sayi eki ile yapilmali");

  // ---- remove: worktree kaldirilir, branch KORUNUR (commit'li is kaybolmasin) ----
  const removed = worktree.remove(repo, second.dir, second.branch, false);
  assert.equal(removed.removed, true, "worktree kaldirilmali");
  assert.equal(removed.branchDeleted, false, "acikca istenmedikce branch silinmemeli");
  assert.ok(worktree.branchExists(repo, second.branch), "branch hala var olmali");
  // Acikca istenirse branch de silinir (bos worktree temizligi bu yolu kullanir).
  const removed2 = worktree.remove(repo, created.dir, created.branch, true);
  assert.equal(removed2.branchDeleted, true, "deleteBranch:true iken branch silinmeli");
  assert.ok(!worktree.branchExists(repo, created.branch), "silinen branch kalmamali");

  // ---- store.normalizeConfig worktree semasini garanti etmeli ----
  const scfg = store.normalizeConfig({ agents: {}, operator: { cli: "codex" } });
  assert.equal(scfg.worktree.mode, "off", "eski config yukseltilince worktree KAPALI kalmali");
  assert.deepEqual(store.normalizeConfig(scfg), scfg, "worktree ile birlikte normalizeConfig idempotent kalmali");
  const dirty = store.normalizeConfig({ agents: {}, operator: { cli: "codex" }, worktree: { mode: "sacma", linkPaths: ["/abs", "../x", "ok"], setupTimeoutSeconds: 1 } });
  assert.equal(dirty.worktree.mode, "off", "gecersiz mode 'off'a dusmeli");
  assert.deepEqual(dirty.worktree.linkPaths, ["ok"], "gecersiz bagli yollar temizlenmeli");
  assert.equal(dirty.worktree.setupTimeoutSeconds, 900);

  // ---- UCTAN UCA: motor gorevi gercekten izole agacta kosuyor mu? ----
  // Birim testler worktree mantigini dogrular; asil risk motorun _cwd'yi izole agaca tasiyip
  // tasimadigi ve ana calisma agacinin gercekten korundugudur.
  store.ensureDirs();
  const base = store.loadConfig();
  const e2eRepo = makeRepo();
  // Kirli durum bilincli: teslimat uyarisinda gorunmeli.
  fs.writeFileSync(path.join(e2eRepo, "commit-edilmemis.txt"), "yerel is\n", "utf8");
  const fakeAgent = isWin
    ? { cmd: path.join(__dirname, "fake-team-cli.cmd"), args: [], timeoutSeconds: 30 }
    : { cmd: process.execPath, args: [path.join(__dirname, "fake-cli.js")], timeoutSeconds: 30 };
  store.saveConfig({
    ...base,
    approvalMode: "auto",
    autonomousConsentAcceptedAt: new Date().toISOString(),
    workingDir: e2eRepo,
    dailyCallBudget: 10000,
    projectContext: false,
    versioning: false,
    operator: { cli: "operator", cmd: fakeAgent.cmd, args: fakeAgent.args, timeoutSeconds: fakeAgent.timeoutSeconds, roleFile: "roles/operator.md", maxRounds: 2, maxDelegationsPerRound: 3 },
    agents: { worker: { ...fakeAgent, description: "test worker", capabilities: ["implementation"], roleFile: "roles/executor.md" } },
    worktree: { mode: "task", branchPrefix: "crewctl/task-", setupCommands: [], linkPaths: [], commit: true, keepOnFailure: true, setupTimeoutSeconds: 60 },
  });
  delete require.cache[require.resolve("../src/engine")];
  const engine = require("../src/engine");
  const task = store.addTask("Izole worktree testi: bir dosya olustur.", e2eRepo, "operator", "fast");
  engine.running = true;
  await engine.runTask(task);
  engine.running = false;

  const done = store.findTask(task.id);
  assert.equal(done.state, "done", "gorev tamamlanmali");
  const gitInfo = done.task.delivery.git;
  assert.ok(gitInfo, "teslimat git bilgisi tasimali");
  assert.match(gitInfo.branch, /^crewctl\/task-/, "teslimat branch adini bildirmeli");
  assert.equal(gitInfo.committed, true, `degisiklikler commit'lenmeli: ${gitInfo.reason || ""}`);
  assert.ok(gitInfo.commit, "commit sha'si teslimatta olmali");
  // ANA CALISMA AGACI KORUNMALI — izolasyonun tum amaci bu.
  assert.ok(!fs.existsSync(path.join(e2eRepo, "team-output.txt")), "ajanin urettigi dosya ANA agaca yazilmamali");
  assert.equal(git(e2eRepo, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim(), "main", "ana deponun aktif branch'i degismemeli");
  // Is gercekten branch'te commit'lenmis olmali.
  const branchFiles = git(e2eRepo, ["show", "--name-only", "--format=", gitInfo.branch]).stdout;
  assert.match(branchFiles, /team-output\.txt/, "uretilen dosya branch commit'inde olmali");
  // Kirli depo uyarisi teslimatta gorunmeli (ajan eksik agac uzerinde calisti).
  assert.ok((done.task.delivery.warnings || []).some((w) => /commit edilmemis/i.test(w)), "commit edilmemis yerel is uyarisi teslimatta olmali");
  // Olay akisinda izolasyon ve commit kullaniciya bildirilmeli.
  const events = store.listRunEvents(task.id);
  assert.ok(events.some((e) => e.type === "log" && /Izole worktree hazir/.test(e.msg || "")), "worktree acilisi bildirilmeli");
  assert.ok(events.some((e) => e.type === "log" && /commit'lendi/.test(e.msg || "")), "commit bildirilmeli");
  assert.ok(events.some((e) => e.type === "log" && /Uzaga gonderilmedi/.test(e.msg || "")), "uzaga gonderilmedigi acikca soylenmeli");

  // Depo git deposu DEGILSE gorev yine calismali (guvenli geri dusme).
  const plainWork = fs.mkdtempSync(path.join(os.tmpdir(), "crewctl-plainwork-"));
  cleanup.push(plainWork);
  const cfg2 = store.loadConfig();
  store.saveConfig({ ...cfg2, workingDir: plainWork });
  const task2 = store.addTask("Git olmayan klasorde worktree geri dusmesi.", plainWork, "operator", "fast");
  engine.running = true;
  await engine.runTask(task2);
  engine.running = false;
  const done2 = store.findTask(task2.id);
  assert.equal(done2.state, "done", "git olmayan klasorde gorev yine tamamlanmali");
  assert.ok(!done2.task.delivery.git, "worktree kurulamadiysa git bilgisi olmamali");
  assert.ok(fs.existsSync(path.join(plainWork, "team-output.txt")), "geri dusmede dosya dogrudan calisma klasorune yazilmali");
  assert.ok(store.listRunEvents(task2.id).some((e) => e.type === "log" && /Worktree izolasyonu kullanilamadi/.test(e.msg || "")), "geri dusme sebebi kullaniciya bildirilmeli");

  console.log("worktree ok");
}

main()
  .then(() => {
    for (const dir of cleanup) { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {} }
  })
  .catch((error) => {
    console.error(error);
    for (const dir of cleanup) { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {} }
    process.exit(1);
  });
