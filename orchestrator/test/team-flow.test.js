const assert = require("assert");
const fs = require("fs");
const path = require("path");
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
  const openCodeWorkspace = path.join(__dirname, ".tmp-opencode-workspace");
  const fakeCli = path.join(__dirname, "fake-cli.js");
  const originalPath = process.env.PATH;
  const callFile = path.join(store.ROOT, "state", `calls-${new Date().toISOString().slice(0, 10)}.txt`);
  const originalCalls = fs.existsSync(callFile) ? fs.readFileSync(callFile, "utf8") : null;
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(approvalWorkspace, { recursive: true });
  fs.mkdirSync(recoveryWorkspace, { recursive: true });
  fs.mkdirSync(routingWorkspace, { recursive: true });
  fs.mkdirSync(openCodeWorkspace, { recursive: true });
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
    base.workingDir = workspace;
    base.dailyCallBudget = 10000;
    // Operatör artık uzman agent'lardan bağımsız bir CLI'dır; testte fake CLI'yi cfg.operator.cmd ile veriyoruz.
    base.operator = { cli: "operator", cmd: agent.cmd, args: agent.args, timeoutSeconds: agent.timeoutSeconds, roleFile: "roles/operator.md", maxRounds: 3, maxDelegationsPerRound: 3 };
    base.agents = {
      worker: { ...agent, description: "test worker", capabilities: ["implementation"], roleFile: "roles/executor.md" },
      broken: { cmd: "fake-failing-cli", args: [], timeoutSeconds: 20, description: "unavailable test worker", capabilities: ["implementation"] },
      planner: { ...agent, description: "plan only", capabilities: ["planning"], roleFile: "roles/planner.md" },
      openworker: { cmd: path.join(__dirname, "fake-opencode.cmd"), adapter: "opencode", args: [], timeoutSeconds: 20, description: "OpenCode worker", capabilities: ["implementation"] },
    };
    store.saveConfig(base);
    delete require.cache[require.resolve("../src/engine")];
    const engine = require("../src/engine");
    const task = store.addTask("Takim halinde bir test dosyasi olustur.", workspace, "operator");
    tasks.push(task);
    engine.running = true;
    await engine.runTask(task);
    engine.running = false;

    const found = store.findTask(task.id);
    assert.equal(found.state, "done");
    assert.equal(found.task.operatorCli, "operator");
    assert.equal(found.task.executionMode, "fast");
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
    const approvalTask = store.addTask("Onayli takim planiyla dosya olustur.", approvalWorkspace, "operator");
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
    assert.ok(approvalEvents.some((event) => event.type === "log" && event.msg.includes("degistirilmeden")));

    base.approvalMode = "auto";
    base.workingDir = recoveryWorkspace;
    store.saveConfig(base);
    const recoveryTask = store.addTask("Hata toleransi ile takim dosyasi olustur.", recoveryWorkspace, "operator");
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

    const effectiveOpenCode = cliRegistry.effectiveAgent({ cmd: "opencode", adapter: "opencode", args: [] });
    assert.equal(cliRegistry.DEFINITIONS.opencode.timeoutSeconds, 1800);
    assert.equal(effectiveOpenCode.args[0], "run");
    assert.ok(effectiveOpenCode.args.includes("{PROMPT_FILE}"));
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
      const promptDir = path.join(store.ROOT, "state", "prompts");
      const leftovers = fs.existsSync(promptDir) ? fs.readdirSync(promptDir).filter((file) => file.startsWith(openCodeTask.id)) : [];
      assert.equal(leftovers.length, 0);
    }
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
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(approvalWorkspace, { recursive: true, force: true });
    fs.rmSync(recoveryWorkspace, { recursive: true, force: true });
    fs.rmSync(routingWorkspace, { recursive: true, force: true });
    fs.rmSync(openCodeWorkspace, { recursive: true, force: true });
    if (originalCalls === null) {
      if (fs.existsSync(callFile)) fs.rmSync(callFile);
    } else fs.writeFileSync(callFile, originalCalls);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
