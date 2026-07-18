const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const store = require("../src/store");
const cliRegistry = require("../src/cli-registry");

const cli = path.join(store.ROOT, "src", "cli.js");
const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: store.ROOT, encoding: "utf8" });

function main() {
  const legacy = {
    operator: {
      cli: "codex",
      model: "opencode-go/legacy",
      codexSettings: { model: "gpt-legacy", reasoningEffort: "high", serviceTier: "priority" },
    },
    cliSettings: { claude: { model: "sonnet" }, gemini: { model: "gemini-old" } },
    agents: {},
  };
  const legacySnapshot = JSON.parse(JSON.stringify(legacy));
  const normalized = store.normalizeConfig(legacy);
  assert.deepEqual(legacy, legacySnapshot, "normalizeConfig girdi nesnesini degistirmemeli");
  assert.equal(normalized.cliSettings.codex.model, "gpt-legacy");
  assert.equal(normalized.cliSettings.opencode.model, "opencode-go/legacy");
  assert.ok(!normalized.cliSettings.claude && !normalized.cliSettings.gemini, "katalogsuz model ayarlari semadan kaldirilmali");
  assert.ok(!("codexSettings" in normalized.operator));
  assert.ok(!("model" in normalized.operator));
  assert.deepEqual(store.normalizeConfig(normalized), normalized, "normalizeConfig idempotent olmali");

  const modelCfg = { cliSettings: {
    codex: { model: "gpt-global", reasoningEffort: "high", serviceTier: "priority" },
    claude: { model: "sonnet" }, gemini: { model: "gemini-2.5-pro" }, opencode: { model: "opencode-go/global" },
  } };
  const codex = cliRegistry.effectiveAgent({ adapter: "codex", cmd: "codex", args: [], model: "gpt-agent" }, modelCfg);
  assert.deepEqual(codex.args.slice(-6), ["--model", "gpt-agent", "-c", 'model_reasoning_effort="high"', "-c", 'service_tier="priority"']);
  const claude = cliRegistry.effectiveAgent({ adapter: "claude", cmd: "claude", args: [] }, modelCfg);
  assert.ok(!claude.args.includes("--model"), "katalogsuz Claude serbest model ayari uygulanmamali");
  const gemini = cliRegistry.effectiveAgent({ adapter: "gemini", cmd: "gemini", args: ["--model", "agent-model"] }, modelCfg);
  assert.equal(gemini.args.filter((arg) => arg === "--model").length, 1, "elle verilen acik CLI argumani korunmali");
  assert.equal(gemini.args[gemini.args.indexOf("--model") + 1], "agent-model");
  const openCode = cliRegistry.effectiveAgent({ adapter: "opencode", cmd: "opencode", args: [], model: "opencode/agent" }, modelCfg);
  assert.equal(openCode.model, "opencode/agent", "agent modeli global CLI ayarini gecersiz kilmali");

  assert.deepEqual(cliRegistry.parseOpenCodeModels([
    "Available models:", "opencode/free-model", "opencode-go/paid-model", "ollama/qwen 2", "ollama/qwen2", "log: done",
  ].join("\n")), ["opencode/free-model", "opencode-go/paid-model", "ollama/qwen2"]);
  assert.equal(cliRegistry.selectOpenCodeModel(["opencode-go/paid-model"]), "opencode-go/paid-model");

  const healthPrompt = "CLI_TEAM_HEALTH_CHECK\nYalnizca HEALTH_OK yaz.";
  const preparedHealth = cliRegistry.preparePromptArgs(["run", "--file", "{PROMPT_FILE}"], healthPrompt);
  try {
    const preparedPath = preparedHealth.args[preparedHealth.args.indexOf("--file") + 1];
    assert.ok(preparedPath && preparedPath !== "{PROMPT_FILE}", "health check prompt dosyasi yer tutucuyu doldurmali");
    assert.equal(fs.readFileSync(preparedPath, "utf8"), healthPrompt);
    assert.equal(preparedHealth.useStdin, false);
  } finally {
    const preparedPath = preparedHealth.promptFile;
    preparedHealth.cleanup();
    assert.ok(!fs.existsSync(preparedPath), "gecici health prompt dosyasi temizlenmeli");
  }

  const mismatchedProfile = { adapter: "claude", cmd: "codex", args: ["-p", "--output-format", "text"], model: "stale-model" };
  assert.equal(cliRegistry.normalizeAgentAdapter(mismatchedProfile), true);
  assert.equal(mismatchedProfile.adapter, "codex", "bilinen komut adapter alanindan ustun olmali");
  assert.deepEqual(mismatchedProfile.args, cliRegistry.DEFINITIONS.codex.defaultArgs, "CLI degisince eski adapter argumanlari temizlenmeli");
  assert.ok(!mismatchedProfile.model, "baska CLI'ye ait model override'i tasinmamali");
  const defensiveProfile = cliRegistry.effectiveAgent({ adapter: "codex", cmd: "claude", args: ["exec", "--skip-git-repo-check"] });
  assert.equal(defensiveProfile.adapter, "claude");
  assert.equal(defensiveProfile.cmd, "claude");
  assert.deepEqual(defensiveProfile.args, cliRegistry.DEFINITIONS.claude.defaultArgs, "runtime bozuk config'i guvenli hedef argumanlarina dondurmeli");
  const wrapperProfile = { adapter: "opencode", cmd: "company-agent-wrapper", args: ["run"] };
  assert.equal(cliRegistry.normalizeAgentAdapter(wrapperProfile), false, "acik adapter verilen ozel wrapper korunmali");
  assert.equal(wrapperProfile.adapter, "opencode");

  const discoveryConfig = {
    discoveryIgnoredAdapters: ["gemini", "opencode"],
    agents: {
      "gemini-auto": { adapter: "gemini", cmd: "gemini", autoDiscovered: true },
      "gemini-auto-2": { adapter: "gemini", cmd: "gemini", autoDiscovered: true },
      "custom-opencode": { adapter: "opencode", cmd: "opencode", args: [] },
    },
  };
  const discovered = [
    { id: "gemini", installed: true, command: "gemini", defaultArgs: [], capabilities: [], roleFile: "roles/executor.md" },
    { id: "opencode", installed: true, command: "opencode", defaultArgs: [], capabilities: [], roleFile: "roles/executor.md" },
  ];
  assert.equal(cliRegistry.addMissingAgents(discoveryConfig, discovered), true);
  assert.ok(!discoveryConfig.agents["gemini-auto"]);
  assert.ok(!discoveryConfig.agents["gemini-auto-2"]);
  assert.ok(discoveryConfig.agents["custom-opencode"], "elle eklenen profil korunmali");
  assert.equal(cliRegistry.addMissingAgents({ discoveryIgnoredAdapters: ["gemini"], agents: {} }, discovered.slice(0, 1)), false);

  const inheritedOpenCode = {
    cliSettings: { opencode: { model: "opencode-go/global" } },
    agents: { "opencode-auto": { adapter: "opencode", cmd: "opencode", args: [], autoDiscovered: true, model: "opencode/old-auto" } },
  };
  assert.equal(cliRegistry.addMissingAgents(inheritedOpenCode, [discovered[1]]), true);
  assert.ok(!inheritedOpenCode.agents["opencode-auto"].model, "eski otomatik agent modeli global CLI ayarini ezmemeli");
  const explicitOpenCode = {
    cliSettings: { opencode: { model: "opencode-go/global" } },
    agents: { "opencode-auto": { adapter: "opencode", cmd: "opencode", args: [], autoDiscovered: true, model: "opencode/manual", modelOverride: true } },
  };
  cliRegistry.addMissingAgents(explicitOpenCode, [discovered[1]]);
  assert.equal(explicitOpenCode.agents["opencode-auto"].model, "opencode/manual", "acik agent override'i korunmali");

  const readinessConfig = { agents: {}, operator: { cli: "opencode" } };
  const readinessDiscovery = [
    { id: "opencode", installed: true, ready: false, command: "opencode", defaultArgs: ["run"], capabilities: [], roleFile: "roles/executor.md" },
    { id: "codex", installed: true, command: "codex", defaultArgs: ["exec"], capabilities: [], roleFile: "roles/executor.md" },
  ];
  assert.equal(cliRegistry.addMissingAgents(readinessConfig, readinessDiscovery), true);
  assert.equal(readinessConfig.agents["opencode-auto"].enabled, false, "modelsiz OpenCode otomatik etkinlesmemeli");
  assert.equal(readinessConfig.agents["opencode-auto"].unavailablePlaceholder, true);
  assert.equal(cliRegistry.ensureValidOperator(readinessConfig, readinessDiscovery), true);
  assert.equal(readinessConfig.operator.cli, "codex", "hazir olmayan OpenCode yerine calisan CLI secilmeli");

  const manualOpenCode = { agents: {}, operator: { cli: "opencode" }, cliSettings: { opencode: { model: "opencode-go/manual" } } };
  assert.equal(cliRegistry.addMissingAgents(manualOpenCode, readinessDiscovery), true);
  assert.equal(manualOpenCode.agents["opencode-auto"].enabled, true, "elle secilen global model OpenCode'u kullanilabilir yapmali");
  assert.ok(!manualOpenCode.agents["opencode-auto"].model, "global model otomatik agent profiline kopyalanmamali");
  assert.equal(cliRegistry.ensureValidOperator(manualOpenCode, readinessDiscovery), true, "eksik sabit operator rolu tamamlanmali");
  assert.equal(manualOpenCode.operator.cli, "opencode");

  store.ensureDirs();
  const help = run("help");
  assert.match(help, /npx @omerrgocmen\/crewctl/);
  assert.match(help, /crewctl task/);
  assert.equal(run("version").trim(), require("../../package.json").version);
  const status = JSON.parse(run("status", "--json"));
  assert.ok(status.queue && Number.isInteger(status.queue.pending));

  const output = run("task", "CLI test gorevi", "--mode", "fast", "--dir", store.ROOT);
  const id = output.match(/Eklendi: (\S+)/)?.[1];
  assert.ok(id);
  const found = store.findTask(id);
  try {
    assert.equal(found.state, "pending");
    assert.equal(found.task.executionMode, "fast");
    assert.equal(found.task.targetDir, store.ROOT);
  } finally {
    store.removeTask("pending", id);
  }

  const approval = { id: `cli-approval-${Date.now()}`, prompt: "test", status: "awaiting-approval", planPreview: "safe" };
  approval.planHash = store.hashText(approval.planPreview);
  store.saveTask("approval", approval);
  try {
    assert.match(run("approve", approval.id), /Onaylandi/);
    assert.equal(store.findTask(approval.id).state, "pending");
  } finally {
    for (const state of ["approval", "pending", "failed"]) store.removeTask(state, approval.id);
  }
  console.log("cli flow ok");
}

main();
