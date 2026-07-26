// ES ZAMANLI GOREV YURUTME testleri.
// Iddia: maxConcurrentTasks > 1 iken iki gorev GERCEKTEN ust uste kosar, her biri kendi izole
// worktree'sinde calisir ve olaylar DOGRU goreve yazilir. Son madde en kritik: es zamanlilikta
// en tehlikeli hata, bir gorevin olayinin baska bir gorevin zaman cizelgesine dusmesidir
// (sessiz, yanlis veri). Mimari bunu worker-basi Engine ornegiyle imkansiz kilar; test bunu olcer.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "crewctl-conc-"));
process.env.CLI_TEAM_ROOT = ROOT;

const store = require("../src/store");

const isWin = process.platform === "win32";
const cleanup = [ROOT];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function git(cwd, args) {
  return spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 30000, windowsHide: true, shell: false });
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crewctl-concrepo-"));
  cleanup.push(dir);
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "CrewCtl Test"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  fs.writeFileSync(path.join(dir, "a.txt"), "ilk\n", "utf8");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", "ilk commit"]);
  return dir;
}

async function main() {
  if (spawnSync("git", ["--version"], { encoding: "utf8", timeout: 15000, windowsHide: true, shell: false }).status !== 0) {
    console.log("concurrency ok (git kurulu degil, atlandi)");
    return;
  }
  store.ensureDirs();

  // ---- Kuyruk sahiplenme: calisan gorev pending'de KALDIGI icin skipIds sart ----
  // NOT: kuyruk sirasi gorev ID'sine gore belirlenir (zaman damgasi + RASTGELE son ek), yani
  // ayni saniyede olusturulan iki gorevin sirasi olusturma sirasiyla ayni olmak zorunda degil.
  // Bu yuzden iddialar sirayla degil KUME uyeligiyle kurulur.
  const t1 = store.addTask("birinci", undefined, "operator", "fast");
  const t2 = store.addTask("ikinci", undefined, "operator", "fast");
  const ids = new Set([t1.id, t2.id]);
  const first = store.nextPending();
  assert.ok(first && ids.has(first.id), "argumansiz nextPending bekleyen bir gorev dondurmeli");
  const second = store.nextPending(new Set([first.id]));
  assert.ok(second && ids.has(second.id), "ustlenilen gorev atlanip DIGERI dondurulmeli");
  assert.notEqual(second.id, first.id, "ayni gorev iki kez verilmemeli (es zamanlilikta cift kosum olurdu)");
  assert.equal(store.nextPending(ids), null, "tum gorevler ustlenildiyse null donmeli");
  assert.equal(store.nextPending([first.id]).id, second.id, "dizi de kabul edilmeli");
  for (const t of [t1, t2]) store.removeTask("pending", t.id);

  // ---- maxConcurrency sikistirma ----
  delete require.cache[require.resolve("../src/engine")];
  const engineProbe = require("../src/engine");
  assert.equal(engineProbe.maxConcurrency({}), 1, "deger yoksa 1 (eski davranis)");
  assert.equal(engineProbe.maxConcurrency({ maxConcurrentTasks: 3 }), 3);
  assert.equal(engineProbe.maxConcurrency({ maxConcurrentTasks: 99 }), 8, "ust sinir 8");
  assert.equal(engineProbe.maxConcurrency({ maxConcurrentTasks: 0 }), 1, "gecersiz deger 1'e dusmeli");
  assert.equal(engineProbe.maxConcurrency({ maxConcurrentTasks: 2.5 }), 1, "tam sayi olmayan deger 1'e dusmeli");
  // status() geriye uyumlu: current tekil kalir, currents/activeIds eklenir.
  const idleStatus = engineProbe.status();
  assert.equal(idleStatus.current, null, "bosta current null olmali");
  assert.deepEqual(idleStatus.currents, [], "bosta currents bos dizi olmali");
  assert.deepEqual(idleStatus.activeIds, [], "bosta activeIds bos dizi olmali");
  assert.equal(idleStatus.concurrency, 1);

  // ---- Gercek es zamanli kosum ----
  const repo = makeRepo();
  const slow = isWin
    ? { cmd: path.join(__dirname, "fake-slow-cli.cmd"), args: [], timeoutSeconds: 60 }
    : { cmd: process.execPath, args: [path.join(__dirname, "fake-slow-cli.js")], timeoutSeconds: 60 };
  const base = store.loadConfig();
  store.saveConfig({
    ...base,
    approvalMode: "auto",
    autonomousConsentAcceptedAt: new Date().toISOString(),
    workingDir: repo,
    dailyCallBudget: 10000,
    projectContext: false,
    versioning: false,
    pollSeconds: 1,
    maxConcurrentTasks: 2,
    worktree: { mode: "task", branchPrefix: "crewctl/task-", setupCommands: [], linkPaths: [], commit: true, keepOnFailure: true, setupTimeoutSeconds: 60 },
    operator: { cli: "operator", cmd: slow.cmd, args: slow.args, timeoutSeconds: slow.timeoutSeconds, roleFile: "roles/operator.md", maxRounds: 2, maxDelegationsPerRound: 3 },
    agents: { worker: { ...slow, description: "yavas worker", capabilities: ["implementation"], roleFile: "roles/executor.md" } },
  });

  delete require.cache[require.resolve("../src/engine")];
  const engine = require("../src/engine");
  // Olaylarin hangi goreve yazildigini bagimsiz olarak da izle (SSE tarafinin gordugu akis).
  const seen = new Map();
  for (const type of ["log", "activity", "message", "result"]) {
    engine.on(type, (event) => {
      if (!event || !event.taskId) return;
      if (!seen.has(event.taskId)) seen.set(event.taskId, []);
      seen.get(event.taskId).push(event);
    });
  }

  const a = store.addTask("Es zamanli gorev A: bir dosya olustur.", repo, "operator", "fast");
  const b = store.addTask("Es zamanli gorev B: bir dosya olustur.", repo, "operator", "fast");

  let maxActive = 0;
  const watcher = setInterval(() => {
    maxActive = Math.max(maxActive, engine.status().activeIds.length);
  }, 60);

  engine.start();
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const doneA = store.findTask(a.id)?.state, doneB = store.findTask(b.id)?.state;
    if (doneA && doneA !== "pending" && doneB && doneB !== "pending") break;
    await sleep(150);
  }
  clearInterval(watcher);
  engine.stop();
  await sleep(400);

  const resA = store.findTask(a.id), resB = store.findTask(b.id);
  assert.equal(resA.state, "done", `A tamamlanmali (${resA.task.error || ""})`);
  assert.equal(resB.state, "done", `B tamamlanmali (${resB.task.error || ""})`);

  // ASIL IDDIA: iki gorev ayni anda calisti.
  assert.equal(maxActive, 2, `iki gorev ust uste kosmali (olculen en yuksek es zamanli: ${maxActive})`);

  // Her gorev KENDI branch'ine commit'lenmeli.
  assert.ok(resA.task.delivery.git?.committed, "A commit'lenmeli");
  assert.ok(resB.task.delivery.git?.committed, "B commit'lenmeli");
  assert.notEqual(resA.task.delivery.git.branch, resB.task.delivery.git.branch, "iki gorev AYRI branch kullanmali");
  assert.notEqual(resA.task.delivery.git.worktree, resB.task.delivery.git.worktree, "iki gorev AYRI worktree kullanmali");
  // Ana calisma agaci ve aktif branch korunmali.
  assert.ok(!fs.existsSync(path.join(repo, "team-output.txt")), "ana agaca dosya sizmamali");
  assert.equal(git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim(), "main", "ana branch degismemeli");
  for (const res of [resA, resB]) {
    assert.match(git(repo, ["show", "--name-only", "--format=", res.task.delivery.git.branch]).stdout, /team-output\.txt/, "is ilgili branch'te commit'lenmeli");
  }

  // EN KRITIK: olay atfi. Bir gorevin kalici olaylari SADECE kendi id'sini tasimali.
  for (const id of [a.id, b.id]) {
    const events = store.listRunEvents(id);
    assert.ok(events.length > 3, `${id} icin olay kaydi olmali`);
    const foreign = events.filter((e) => e.taskId && e.taskId !== id);
    assert.equal(foreign.length, 0, `${id} olay kaydinda BASKA gorevin olayi bulunmamali (bulunan: ${foreign.length})`);
  }
  // Canli akista da iki gorev ayri ayri gorulmeli ve karisMAMALI.
  assert.ok(seen.has(a.id) && seen.has(b.id), "canli akista iki gorev de gorunmeli");
  for (const [id, events] of seen) {
    assert.equal(events.filter((e) => e.taskId !== id).length, 0, `${id} akisinda yabanci olay olmamali`);
  }
  // Cagri sayaci da worker BASINA olmali. callId = `<taskId>-<n>`; paylasilan bir sayac olsaydi
  // ikinci gorevin numaralari 1'den degil 3'ten baslardi. (usageSummary() token telemetrisi
  // bildirmeyen CLI'larda null doner, bu yuzden izolasyon callId uzerinden olculur.)
  for (const id of [a.id, b.id]) {
    const callIds = [...new Set(store.listRunEvents(id).map((e) => e.callId).filter(Boolean))];
    assert.ok(callIds.length >= 2, `${id} icin en az iki CLI cagrisi olmali`);
    assert.equal(callIds.filter((c) => !String(c).startsWith(id)).length, 0, `${id} cagri kimlikleri BASKA gorevin id'sini tasimamali`);
    assert.ok(callIds.includes(`${id}-1`), `${id} cagri sayaci 1'den baslamali (worker basina ayri sayac)`);
  }

  // Slotlar bosalmali; asili worker/inFlight kalmamali.
  assert.equal(engine.workers.size, 0, "tum worker slotlari bosalmali");
  assert.equal(engine.inFlight.size, 0, "ustlenilen gorev kumesi bosalmali");
  assert.equal(engine.status().activeIds.length, 0, "durdurulduktan sonra aktif gorev kalmamali");

  console.log("concurrency ok");
}

main()
  .then(() => {
    for (const dir of cleanup) { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {} }
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    for (const dir of cleanup) { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {} }
    process.exit(1);
  });
