const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
// Testi canli runtime'dan izole et: store'u require etmeden ONCE kendi gecici ROOT'unu ayarla.
// Boylece gercek config.json/queue'ya hic dokunmaz, canli sunucuyla dosya kilitlemesi (EPERM)
// yasanmaz ve test yarida coker kalsa bile kullanicinin gercek konfigurasyonu bozulmaz.
const REAL_ROOT = path.join(__dirname, "..");
const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "cli-team-teamflow-"));
process.env.CLI_TEAM_ROOT = TEST_ROOT;
// NOT: fs.cpSync Windows'ta non-ASCII yollarda (or. C:\Users\Ömer) EIO/cokme veriyor; bu yuzden
// tum kod tabani gibi Unicode-guvenli copyFileSync kullaniyoruz. roles/ duz bir .md klasoru.
fs.mkdirSync(path.join(TEST_ROOT, "roles"), { recursive: true });
for (const file of fs.readdirSync(path.join(REAL_ROOT, "roles"))) {
  fs.copyFileSync(path.join(REAL_ROOT, "roles", file), path.join(TEST_ROOT, "roles", file));
}
fs.copyFileSync(path.join(REAL_ROOT, "config.default.json"), path.join(TEST_ROOT, "config.default.json"));
const store = require("../src/store");
const cliRegistry = require("../src/cli-registry");

async function main() {
  store.ensureDirs();
  store.loadConfig(); // config.json yoksa sablondan uret (temiz klonda da test calissin)
  const configFile = path.join(store.ROOT, "config.json");
  const originalConfig = fs.readFileSync(configFile, "utf8");
  const memoryFile = path.join(store.ROOT, "memory", "log.md");
  const originalMemory = fs.existsSync(memoryFile) ? fs.readFileSync(memoryFile, "utf8") : null;
  const workspace = path.join(__dirname, ".tmp-team-workspace");
  const approvalWorkspace = path.join(__dirname, ".tmp-approval-workspace");
  const recoveryWorkspace = path.join(__dirname, ".tmp-recovery-workspace");
  const routingWorkspace = path.join(__dirname, ".tmp-routing-workspace");
  const reviewLoopWorkspace = path.join(__dirname, ".tmp-review-loop-workspace");
  const reviewGovernorWorkspace = path.join(__dirname, ".tmp-review-governor-workspace");
  const partialWorkspace = path.join(__dirname, ".tmp-partial-workspace");
  const shortcutWorkspace = path.join(__dirname, ".tmp-shortcut-workspace");
  const operatorDirectWorkspace = path.join(__dirname, ".tmp-operator-direct-workspace");
  const openCodeWorkspace = path.join(__dirname, ".tmp-opencode-workspace");
  const fakeCli = path.join(__dirname, "fake-cli.js");
  const originalPath = process.env.PATH;
  const callFile = path.join(store.ROOT, "state", `calls-${new Date().toISOString().slice(0, 10)}.txt`);
  const originalCalls = fs.existsSync(callFile) ? fs.readFileSync(callFile, "utf8") : null;
  // Windows'ta bir onceki kosunun teardown'i gecici bir kilit (EBUSY/EPERM) nedeniyle
  // klasoru silememis olabilir. Stale bir workspace, icindeki eski dosyayi "onceden vardi"
  // sayarak snapshot diff'ini bozar ve YANLIS bir basarisizlik uretir. Best-effort ve
  // asla firlatmayan bu yardimci hem baslangicta hem teardown'da kullanilir.
  const removeWorkspace = (dir) => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {} };
  const workspaces = [workspace, approvalWorkspace, recoveryWorkspace, routingWorkspace, reviewLoopWorkspace, reviewGovernorWorkspace, partialWorkspace, shortcutWorkspace, operatorDirectWorkspace, openCodeWorkspace];
  for (const dir of workspaces) { removeWorkspace(dir); fs.mkdirSync(dir, { recursive: true }); }
  const tasks = [];
  try {
    const base = JSON.parse(originalConfig);
    process.env.PATH = `${__dirname}${path.delimiter}${originalPath}`;
    // Windows'ta uzantısız npm CLI adı gibi PATH üzerinden bulunan .cmd shim'ini
    // kullanır. Test yolu özellikle Unicode kullanıcı dizini içindedir.
    const agent = process.platform === "win32"
      ? { cmd: path.join(__dirname, "fake-team-cli.cmd"), args: [], timeoutSeconds: 20 }
      : { cmd: process.execPath, args: [fakeCli], timeoutSeconds: 20 };
    base.approvalMode = "auto";
    base.autonomousConsentAcceptedAt = new Date().toISOString();
    base.workingDir = workspace;
    base.dailyCallBudget = 10000;
    // Operatör artık uzman agent'lardan bağımsız bir CLI'dır; testte fake CLI'yi cfg.operator.cmd ile veriyoruz.
    base.operator = { cli: "operator", cmd: agent.cmd, args: agent.args, timeoutSeconds: agent.timeoutSeconds, roleFile: "roles/operator.md", maxRounds: 3, maxDelegationsPerRound: 3 };
    base.agents = {
      worker: { ...agent, description: "test worker", capabilities: ["implementation"], roleFile: "roles/executor.md" },
      flaky: { ...agent, description: "delegasyon bazli kontrollu hata agenti", capabilities: ["implementation"], roleFile: "roles/executor.md" },
      broken: { cmd: "fake-failing-cli", args: [], timeoutSeconds: 20, description: "unavailable test worker", capabilities: ["implementation"] },
      planner: { ...agent, description: "plan only", capabilities: ["planning"], roleFile: "roles/planner.md" },
      reviewer: { ...agent, description: "independent reviewer", capabilities: ["review"], roleFile: "roles/reviewer.md" },
      // OpenCode adapteri argumanlari kendisi kurar (run/--format/--file), bu yuzden cmd tek bir
      // calistirilabilir olmali: Windows'ta .cmd shim'i, POSIX'te shebang'li betigin kendisi.
      openworker: { cmd: path.join(__dirname, process.platform === "win32" ? "fake-opencode.cmd" : "fake-opencode.js"), adapter: "opencode", args: [], timeoutSeconds: 20, description: "OpenCode worker", capabilities: ["implementation"] },
    };
    store.saveConfig(base);
    delete require.cache[require.resolve("../src/engine")];
    const engine = require("../src/engine");
    const task = store.addTask("Takim halinde bir test dosyasi olustur.", workspace, "operator", "fast");
    tasks.push(task);
    engine.running = true;
    await engine.runTask(task);
    engine.running = false;

    const found = store.findTask(task.id);
    assert.equal(found.state, "done");
    assert.equal(found.task.operatorCli, "operator");
    assert.equal(found.task.executionMode, "fast");
    assert.ok(found.task.checkpointId, "gorev oncesi otomatik surum (checkpoint) alinmali");
    assert.equal(found.task.teamState.round, 1);
    assert.ok(found.task.teamState.results["build-output"]);
    assert.equal(found.task.teamState.messages.length, 2);
    assert.ok(fs.existsSync(path.join(workspace, "team-output.txt")));
    assert.ok(found.task.changes.created.includes("team-output.txt"));
    assert.ok(found.task.delivery.files.some((file) => file.path === "team-output.txt" && file.action === "created"));
    assert.equal(found.task.delivery.mode, "fast");
    assert.ok(found.task.delivery.verification.includes("dosya mevcut"));
    assert.ok(found.task.delivery.summary.length <= 712);
    const events = store.listRunEvents(task.id);
    assert.ok(events.some((event) => event.type === "message"));
    assert.ok(events.some((event) => event.type === "activity" && event.kind === "stderr"));
    assert.equal(events.filter((event) => event.type === "activity" && event.kind === "process.started").length, 2);
    assert.ok(events.some((event) => event.type === "log" && event.msg.includes("ikinci operator")));

    const chatTask = store.addChatTask(found.task, "Hangi dosyayi olusturdunuz?");
    tasks.push(chatTask);
    engine.running = true;
    await engine.runTask(chatTask);
    engine.running = false;
    const refreshedParent = store.findTask(task.id);
    assert.equal(refreshedParent.task.conversation.length, 1);
    assert.ok(refreshedParent.task.conversation[0].answer.includes("team-output.txt"));
    assert.equal(store.findTask(chatTask.id).state, "done");

    base.approvalMode = "ask";
    base.riskyPatterns = ["team-output.txt"];
    base.workingDir = approvalWorkspace;
    store.saveConfig(base);
    const approvalTask = store.addTask("Onayli takim planiyla dosya olustur.", approvalWorkspace, "operator", "fast");
    tasks.push(approvalTask);
    engine.running = true;
    await engine.runTask(approvalTask);
    let approvalFound = store.findTask(approvalTask.id);
    assert.equal(approvalFound.state, "approval");
    assert.ok(approvalFound.task.planHash);
    approvalFound.task.approved = true;
    approvalFound.task.status = "pending";
    store.moveTask("approval", "pending", approvalFound.task);
    await engine.runTask(approvalFound.task);
    engine.running = false;
    approvalFound = store.findTask(approvalTask.id);
    assert.equal(approvalFound.state, "done");
    const approvalEvents = store.listRunEvents(approvalTask.id);
    assert.equal(approvalEvents.filter((event) => event.type === "activity" && event.kind === "process.started" && event.stage === "operator-plan").length, 1);
    assert.ok(approvalEvents.some((event) => event.type === "log" && event.msg.includes("zorunlu rol zinciri")));

    base.approvalMode = "auto";
    base.workingDir = recoveryWorkspace;
    store.saveConfig(base);
    const recoveryTask = store.addTask("Hata toleransi ile takim dosyasi olustur.", recoveryWorkspace, "operator", "fast");
    tasks.push(recoveryTask);
    engine.running = true;
    await engine.runTask(recoveryTask);
    engine.running = false;
    const recoveryFound = store.findTask(recoveryTask.id);
    assert.equal(recoveryFound.state, "done");
    assert.equal(recoveryFound.task.teamState.results["broken-attempt"].status, "failed");
    assert.equal(recoveryFound.task.teamState.results["broken-attempt"].error.code, "AUTH_INVALID");
    assert.equal(recoveryFound.task.teamState.results["fallback-build"].status, "completed");
    assert.ok(recoveryFound.task.teamState.messages.some((message) => message.messageType === "failure"));
    assert.ok(fs.existsSync(path.join(recoveryWorkspace, "team-output.txt")));
    assert.ok(!engine.agentCatalog(base, "operator").some((agent) => agent.name === "broken"));
    assert.ok(store.listRunEvents(recoveryTask.id).some((event) => event.type === "log" && event.msg.includes("tur butcesinden dusulmedi")));

    const roleCatalog = engine.agentCatalog(base, "operator");
    assert.deepEqual(roleCatalog.find((item) => item.name === "worker").allowedKinds, ["implement"]);
    assert.deepEqual(roleCatalog.find((item) => item.name === "reviewer").allowedKinds, ["review"]);
    assert.deepEqual(roleCatalog.find((item) => item.name === "planner").allowedKinds, ["plan"]);

    const effectiveCodex = cliRegistry.effectiveAgent({ cmd: "codex", args: [] });
    assert.deepEqual(effectiveCodex.args.slice(0, 2), ["exec", "--skip-git-repo-check"]);
    base.workingDir = routingWorkspace;
    store.saveConfig(base);
    const routingTask = store.addTask("Yanlis rol secilse bile uygulama yap.", routingWorkspace, "operator");
    tasks.push(routingTask);
    engine.running = true;
    await engine.runTask(routingTask);
    engine.running = false;
    const routingFound = store.findTask(routingTask.id);
    assert.equal(routingFound.state, "done");
    assert.ok(routingFound.task.teamState.results["auto-route"], JSON.stringify(routingFound.task.teamState.results, null, 2));
    assert.equal(routingFound.task.teamState.results["auto-route"].agent, "worker");
    assert.equal(routingFound.task.teamState.results["auto-route"].requestedAgent, "planner");
    assert.ok(fs.existsSync(path.join(routingWorkspace, "team-output.txt")));

    // PASS hizli yolu: ayni turdaki tum delegasyonlar tamamlanip denetci PASS verdiginde
    // ikinci operator cagrisi yapilmadan teslimat tamamlanmalidir.
    base.workingDir = reviewLoopWorkspace;
    store.saveConfig(base);
    const loopTask = store.addTask("Inceleme dongusu senaryosunu takim akisiyla calistir.", reviewLoopWorkspace, "operator");
    tasks.push(loopTask);
    engine.running = true;
    await engine.runTask(loopTask);
    engine.running = false;
    const loopFound = store.findTask(loopTask.id);
    assert.equal(loopFound.state, "done");
    assert.equal(loopFound.task.executionMode, "balanced");
    assert.equal(loopFound.task.teamState.results["balanced-plan"].status, "completed");
    assert.equal(loopFound.task.teamState.results["balanced-plan"].agent, "planner");
    assert.ok(loopFound.task.teamState.results["loop-build"].dependsOn.includes("balanced-plan"));
    assert.ok(loopFound.task.teamState.results["loop-review"].dependsOn.includes("loop-build"));
    assert.equal(loopFound.task.teamState.results["loop-review"].verdict, "PASS");
    assert.ok(!loopFound.task.teamState.results["loop-review-r2"], "PASS sonrasi ek inceleme calistirilmamali");
    assert.equal(loopFound.task.teamState.round, 1);
    assert.ok(loopFound.task.delivery.verification.includes("VERDICT: PASS"));
    assert.ok(fs.existsSync(path.join(reviewLoopWorkspace, "team-output.txt")));
    const loopEvents = store.listRunEvents(loopTask.id);
    assert.ok(loopEvents.some((event) => event.type === "log" && event.msg.includes("operator degerlendirme cagrisi atlandi")));
    assert.equal(loopEvents.filter((event) => event.type === "activity" && event.kind === "process.started" && event.stage === "operator-plan").length, 1);
    assert.equal(loopEvents.filter((event) => event.type === "activity" && event.kind === "process.started" && event.stage === "operator-review").length, 0);

    // Vali yedegi: turdaki bir altyapi hatasi PASS hizli yolunu kapatir. Operator yalnizca
    // yeni inceleme isterse mevcut taze PASS ile dongu kesilmelidir.
    base.workingDir = reviewGovernorWorkspace;
    store.saveConfig(base);
    const governorTask = store.addTask("Inceleme valisi senaryosunu takim akisiyla calistir.", reviewGovernorWorkspace, "operator");
    tasks.push(governorTask);
    engine.running = true;
    await engine.runTask(governorTask);
    engine.running = false;
    const governorFound = store.findTask(governorTask.id);
    assert.equal(governorFound.state, "done");
    assert.equal(governorFound.task.teamState.results["governor-review"].verdict, "PASS");
    assert.equal(governorFound.task.teamState.results["governor-broken"].status, "failed");
    assert.ok(!governorFound.task.teamState.results["governor-review-r2"]);
    assert.ok(store.listRunEvents(governorTask.id).some((event) => event.type === "log" && event.msg.includes("yalnizca yeni inceleme")));

    // Kismi teslimat: operator hicbir turda complete demezse tamamlanan is failed yerine
    // uyarili done olarak teslim edilmelidir.
    base.workingDir = partialWorkspace;
    store.saveConfig(base);
    const partialTask = store.addTask("Kismi teslimat senaryosunu takim akisiyla calistir.", partialWorkspace, "operator");
    tasks.push(partialTask);
    engine.running = true;
    await engine.runTask(partialTask);
    engine.running = false;
    const partialFound = store.findTask(partialTask.id);
    assert.equal(partialFound.state, "done");
    assert.equal(partialFound.task.teamState.round, 3);
    assert.ok(partialFound.task.final.startsWith("KISMI TESLIMAT"));
    assert.ok(Array.isArray(partialFound.task.delivery.warnings) && partialFound.task.delivery.warnings.length >= 2);
    assert.ok(partialFound.task.delivery.warnings.some((warning) => warning.includes("Tur butcesi doldu")));
    assert.ok(fs.existsSync(path.join(partialWorkspace, "team-output.txt")));
    assert.ok(store.listRunEvents(partialTask.id).some((event) => event.type === "log" && event.msg.includes("kismi teslimat")));

    // Kestirme valisi: gercek bir yapim gorevi, operator delegasyonsuz "complete" dese bile
    // reddedilmeli, yeniden planlama istenmeli ve is fiilen delege edilip teslim edilmelidir.
    base.workingDir = shortcutWorkspace;
    store.saveConfig(base);
    const shortcutTask = store.addTask("Kestirme kotuye kullanim: team-output.txt olustur.", shortcutWorkspace, "operator");
    tasks.push(shortcutTask);
    engine.running = true;
    await engine.runTask(shortcutTask);
    engine.running = false;
    const shortcutFound = store.findTask(shortcutTask.id);
    assert.equal(shortcutFound.state, "done");
    assert.ok(shortcutFound.task.teamState.results["shortcut-build"], "yapim gorevi fiilen delege edilmeli");
    assert.equal(shortcutFound.task.teamState.results["shortcut-build"].status, "completed");
    assert.ok(fs.existsSync(path.join(shortcutWorkspace, "team-output.txt")));
    assert.ok(store.listRunEvents(shortcutTask.id).some((event) => event.type === "log" && event.msg.includes("delegasyonsuz kapatmaya")));

    // Operator dogrudan uygulama: operator JSON plani yerine isi kendisi yapip duz metin
    // donerse (or. OpenCode operator rolunde) motor JSON parse edemez; ancak calisma klasoru
    // degistigi icin salvage bunu sahte basari yerine uyarili kismi teslimatla korumalidir.
    base.workingDir = operatorDirectWorkspace;
    store.saveConfig(base);
    const directTask = store.addTask("Operator dogrudan uygula: bir cikti dosyasi yaz.", operatorDirectWorkspace, "operator");
    tasks.push(directTask);
    engine.running = true;
    let directError = null;
    try { await engine.runTask(directTask); } catch (error) { directError = error; }
    engine.stopLiveDiff();
    engine.running = false;
    assert.ok(directError && /JSON/i.test(directError.message), "operator duz metin donunce runTask JSON hatasi firlatmali");
    assert.equal(engine.salvage(directTask, directError), true, "operatorun dogrudan degisikligi kurtarilmali");
    const directFound = store.findTask(directTask.id);
    assert.equal(directFound.state, "done");
    assert.ok(directFound.task.final.startsWith("KISMI TESLIMAT"));
    assert.ok(directFound.task.delivery.warnings.some((warning) => warning.includes("dogrudan yapti")));
    assert.ok(fs.existsSync(path.join(operatorDirectWorkspace, "team-output.txt")));

    // Saf kurallar: kimlik cakismasi yeniden adlandirilmali, verdict metnin sonundan okunmali.
    const { normalizeAssignments, ensureBalancedRoleChain, extractVerdict, clipMiddle, taskRequiresDelegation } = engine._internals;

    // Protokol ayiklama: operator JSON'u aciklamayla sarmalasa, final metninde susly parantez
    // kullansa veya birden fazla nesne dondurse bile protokol nesnesi bulunmali.
    const { parseJson, conversationalAnswer } = engine._internals;
    assert.equal(parseJson('Merhaba!\n\n{"status":"complete","final":"selam"}', "t").final, "selam");
    assert.equal(parseJson('{"status":"complete","final":"kod: {a:1} bitti"}', "t").final, "kod: {a:1} bitti");
    assert.equal(parseJson('{"not":"protokol"}\n{"status":"complete","final":"son"}', "t").final, "son");
    assert.equal(parseJson('```json\n{"status":"complete","final":"fenced",}\n```', "t").final, "fenced");
    assert.throws(() => parseJson("hicbir nesne yok", "Operator plani"), /gecerli JSON dondurmedi/);

    // Sohbet kurtarma: is gerektirmeyen gorevde duz metin cevap, protokol hatasi yerine teslimat olur.
    const protocolError = (() => { try { parseJson("Merhaba! Size nasil yardimci olabilirim?", "Operator plani"); } catch (e) { return e; } })();
    assert.equal(conversationalAnswer(protocolError), "Merhaba! Size nasil yardimci olabilirim?");
    assert.equal(conversationalAnswer(new Error("baska bir hata")), null);
    assert.equal(conversationalAnswer((() => { try { parseJson("  .  ", "Operator plani"); } catch (e) { return e; } })()), null);

    // Kullanim telemetrisi: OpenCode step_finish olayindan token/maliyet cikarilmali,
    // metin sozlesmesi HIC degismemeli, veri vermeyen CLI'lar 0 degil null dondurmeli.
    const { normalizeCliOutput, addUsage, usageTotal } = engine._internals;
    const opencodeAgent = { adapter: "opencode", args: ["run", "--format", "json"] };
    const realOutput = [
      '{"type":"text","part":{"type":"text","text":"Merhaba!\\n\\n{\\"status\\":\\"complete\\",\\"final\\":\\"selam\\"}"}}',
      '{"type":"step_finish","part":{"cost":0,"tokens":{"input":5714,"output":263,"reasoning":195,"cache":{"read":10240,"write":0}}}}',
    ].join("\n");
    const parsed = normalizeCliOutput(opencodeAgent, realOutput);
    assert.equal(parsed.usage.input, 5714);
    assert.equal(parsed.usage.output, 263);
    assert.equal(parsed.usage.reasoning, 195);
    assert.equal(parsed.usage.cacheRead, 10240);
    // Regresyon koruma: telemetri eklemek operatorun okudugu metni bozmamali.
    assert.equal(parseJson(parsed.text, "t").final, "selam");
    // Coklu adim toplanmali.
    const twoSteps = realOutput + '\n{"type":"step_finish","part":{"cost":0.0042,"tokens":{"input":100,"output":50,"cache":{"read":5,"write":7}}}}';
    const summed = normalizeCliOutput(opencodeAgent, twoSteps).usage;
    assert.equal(summed.input, 5814);
    assert.equal(summed.cost, 0.0042);
    assert.equal(summed.cacheWrite, 7);
    // Metin modundaki CLI'lar ve token alani olmayan adimlar "veri yok" demeli.
    assert.equal(normalizeCliOutput({ adapter: "claude", args: ["-p"] }, "duz metin").usage, null);
    assert.equal(normalizeCliOutput(opencodeAgent, '{"type":"step_finish","part":{"reason":"stop"}}').usage, null);
    assert.equal(usageTotal({ input: 10, output: 5 }), 15);
    assert.equal(addUsage(null, { input: 3, cost: 1 }).input, 3);

    // CLI hata teshisi: kullanicinin "limitim mi bitti, CLI mi acilmadi" sorusunu ayirt etmeli.
    const { classifyCliError, QUARANTINE_CLI_ERRORS } = engine._internals;
    const code = (message) => classifyCliError(new Error(message)).code;
    assert.equal(code("gemini cikis kodu 1.\nPlease set an Auth method in your settings"), "AUTH_REQUIRED");
    // Regresyon: bu mesaj eskiden genis /not found/ deseniyle CLI_NOT_FOUND'a dusuyordu.
    assert.equal(code("GEMINI_API_KEY environment variable not found"), "AUTH_REQUIRED");
    assert.equal(code("[429] RESOURCE_EXHAUSTED: Quota exceeded for quota metric"), "QUOTA_EXCEEDED");
    assert.equal(code("Error: 429 Too Many Requests, retry in 12s"), "RATE_LIMIT");
    assert.equal(code("503 The model is overloaded. Please try again later."), "MODEL_OVERLOADED");
    assert.equal(code("getaddrinfo ENOTFOUND generativelanguage.googleapis.com"), "NETWORK_ERROR");
    assert.equal(code("'gemini' is not recognized as an internal or external command"), "CLI_NOT_FOUND");
    assert.equal(code("User location is not supported for the API use"), "REGION_BLOCKED");
    assert.equal(code("API key not valid. Please pass a valid API key."), "AUTH_INVALID");
    // Kota/bolge beklemekle gecmez -> karantina; hiz siniri ve gecici yuk gecer -> karantina yok.
    assert.ok(QUARANTINE_CLI_ERRORS.has("QUOTA_EXCEEDED") && QUARANTINE_CLI_ERRORS.has("REGION_BLOCKED"));
    assert.ok(!QUARANTINE_CLI_ERRORS.has("RATE_LIMIT") && !QUARANTINE_CLI_ERRORS.has("MODEL_OVERLOADED"));
    // Siniflandirilamayan hatada bilgisiz ilk satir yerine gercek hata cumlesi ozetlenmeli.
    const opaque = classifyCliError(new Error("gemini cikis kodu 1.\n    at run (node:internal/x)\nSomething unexpected went wrong while contacting the service"));
    assert.equal(opaque.code, "CLI_FAILED");
    assert.match(opaque.summary, /Something unexpected went wrong/);
    assert.ok(opaque.action);
    assert.equal(taskRequiresDelegation("3D lunapark sahnesi olustur"), true);
    assert.equal(taskRequiresDelegation("kac beceri var"), false);
    const dedupeUsed = new Set(["fix-1"]);
    const dedupeCfg = { operator: { maxDelegationsPerRound: 5 }, agents: { worker: { capabilities: ["implementation"] } } };
    const deduped = normalizeAssignments([
      { id: "fix-1", agent: "worker", kind: "implement", instruction: "duzelt", dependsOn: [] },
      { id: "verify-1", agent: "worker", kind: "implement", instruction: "uygula ve kontrol et", dependsOn: ["fix-1"] },
    ], dedupeCfg, "operator", dedupeUsed);
    assert.equal(deduped[0].id, "fix-1-r2");
    assert.equal(deduped[0].renamedFrom, "fix-1");
    assert.deepEqual(deduped[1].dependsOn, ["fix-1-r2"]);
    const chainUsed = new Set(["build", "review"]);
    const chained = ensureBalancedRoleChain([
      { id: "build", agent: "worker", kind: "implement", instruction: "uygula", dependsOn: [] },
      { id: "review", agent: "reviewer", kind: "review", instruction: "incele", dependsOn: [] },
    ], base, "operator", { executionMode: "balanced" }, chainUsed);
    assert.deepEqual(chained.map((item) => item.kind), ["plan", "implement", "review"]);
    assert.equal(chained[0].agent, "planner");
    assert.deepEqual(chained[1].dependsOn, [chained[0].id]);
    assert.deepEqual(chained[2].dependsOn, ["build"]);
    assert.equal(extractVerdict("BULGULAR: eski karar VERDICT: FAIL idi\nDOĞRULAMA: tamam\nVERDICT: PASS"), "PASS");
    assert.equal(extractVerdict("verdict icermeyen rapor"), null);
    assert.ok(clipMiddle(`${"a".repeat(9000)}VERDICT: PASS`, 400).endsWith("VERDICT: PASS"), "kirpma sondaki karari korumali");

    const effectiveOpenCode = cliRegistry.effectiveAgent({ cmd: "opencode", adapter: "opencode", args: [], model: "opencode/test-model" });
    assert.equal(cliRegistry.DEFINITIONS.opencode.timeoutSeconds, 1800);
    assert.equal(effectiveOpenCode.silenceTimeoutSeconds, 300);
    assert.equal(effectiveOpenCode.args[0], "run");
    assert.ok(!effectiveOpenCode.args.includes("--auto"));
    assert.ok(effectiveOpenCode.args.includes("--format"));
    assert.ok(effectiveOpenCode.args.includes("json"));
    assert.ok(effectiveOpenCode.args.includes("--model"));
    assert.ok(effectiveOpenCode.args.includes("opencode/test-model"));
    assert.ok(effectiveOpenCode.args.includes("{PROMPT_FILE}"));
    assert.equal(cliRegistry.selectOpenCodeModel(["ollama/local", "opencode/free-model"]), "opencode/free-model");
    assert.equal(cliRegistry.selectOpenCodeModel(["ollama/local"]), "", "yerel Ollama otomatik olarak erisilebilir varsayilmamali");

    // Uygulama agenti kalmadi guvenligi: tek executor karantinaya alininca implement agenti kalmaz.
    const implCfg = { agents: { p: { roleFile: "roles/planner.md", capabilities: ["planning"] }, r: { roleFile: "roles/reviewer.md", capabilities: ["review"] }, x: { roleFile: "roles/executor.md", capabilities: ["implementation"] } } };
    assert.equal(engine.hasUsableImplementAgent(implCfg, "operator"), true, "executor saglikliyken implement agenti var");
    engine.unhealthyAgents.set("x", { code: "CLI_STALLED", at: new Date().toISOString() });
    assert.equal(engine.hasUsableImplementAgent(implCfg, "operator"), false, "tek executor karantinada iken implement agenti kalmamali");
    engine.unhealthyAgents.delete("x");
    if (process.platform === "win32") {
      base.workingDir = openCodeWorkspace;
      store.saveConfig(base);
      const openCodeTask = store.addTask("Basit OpenCode adapter testi yap.", openCodeWorkspace, "operator", "fast");
      tasks.push(openCodeTask);
      engine.running = true;
      await engine.runTask(openCodeTask);
      engine.running = false;
      const openCodeFound = store.findTask(openCodeTask.id);
      assert.equal(openCodeFound.state, "done");
      assert.equal(openCodeFound.task.teamState.results["opencode-build"].agent, "openworker");
      assert.ok(fs.existsSync(path.join(openCodeWorkspace, "opencode-output.txt")));
      // UCTAN UCA telemetri: sahte OpenCode'un yayinladigi step_finish, gorevin usage
      // ozetine ve agent bazli dokumune ulasmis olmali. Ayrica gunluk birikim islemeli.
      const usage = openCodeFound.task.usage;
      assert.ok(usage, "tamamlanan gorevde kullanim ozeti bulunmali");
      assert.equal(usage.byAgent.openworker.input, 1200);
      assert.equal(usage.byAgent.openworker.cost, 0.0125);
      assert.equal(usage.total.output, 340);
      assert.equal(usage.total.cacheRead, 800);
      // Operator (fake-team-cli) telemetri vermez; toplam cagri > bildiren cagri olmali ki
      // arayuz "eksik olabilir" uyarisini gosterebilsin.
      assert.ok(usage.calls > usage.reportingCalls, "telemetri vermeyen cagrilar sayilmali");
      assert.ok(store.getDailyUsage().input >= 1200, "gunluk birikim yazilmali");
      const promptDir = path.join(store.ROOT, "state", "prompts");
      const leftovers = fs.existsSync(promptDir) ? fs.readdirSync(promptDir).filter((file) => file.startsWith(openCodeTask.id)) : [];
      assert.equal(leftovers.length, 0);
    }
    await assert.rejects(
      engine.runCli("silent-test", { cmd: process.execPath, args: [path.join(__dirname, "fake-silent-cli.js")], adapter: "custom", timeoutSeconds: 20, silenceTimeoutSeconds: 1 }, "test", base),
      /CLI_STALLED/
    );
    const realInvokeOperator = engine.invokeOperator;
    let stalledOperatorCalls = 0;
    engine.invokeOperator = async () => { stalledOperatorCalls++; throw new Error("CLI_STALLED: operator cikti uretmedi"); };
    try {
      await assert.rejects(engine.invokeOperatorJson("opencode", "test", { operator: { protocolRetries: 3 } }, "operator-plan", "Operator plani"), /CLI_STALLED/);
      assert.equal(stalledOperatorCalls, 1, "sessiz operator altyapi hatasi protokol tekrari yapmamali");
    } finally {
      engine.invokeOperator = realInvokeOperator;
    }
    delete base.autonomousConsentAcceptedAt;
    store.saveConfig(base);
    assert.throws(() => engine.start(), /ilk kullanim uyarisini onaylayin/);
    assert.equal(engine.running, false);
    console.log("team flow ok");
  } finally {
    fs.writeFileSync(configFile, originalConfig);
    process.env.PATH = originalPath;
    if (originalMemory === null) {
      if (fs.existsSync(memoryFile)) fs.rmSync(memoryFile);
    } else fs.writeFileSync(memoryFile, originalMemory);
    for (const task of tasks) {
      for (const state of ["pending", "done", "failed", "approval"]) store.removeTask(state, task.id);
      const eventFile = path.join(store.ROOT, "state", "events", `${task.id}.jsonl`);
      if (fs.existsSync(eventFile)) fs.rmSync(eventFile);
    }
    for (const dir of workspaces) removeWorkspace(dir);
    if (originalCalls === null) {
      if (fs.existsSync(callFile)) fs.rmSync(callFile);
    } else fs.writeFileSync(callFile, originalCalls);
    // Izole gecici ROOT'u tamamen kaldir; gercek runtime zaten hic kullanilmadi.
    removeWorkspace(TEST_ROOT);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
