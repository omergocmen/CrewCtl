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

  // --- Ajan hapsi (sandbox) ---
  // workspace modu: codex disariya yazamasin diye -s workspace-write eklenir; exec/skip-git ilk
  // ikili ve model/effort/tier son alti KORUNUR (sandbox bayragi arada, sonda degil).
  const sbCfg = { sandbox: { mode: "workspace", extraWritableDirs: [] }, cliSettings: { codex: { model: "gpt-x", reasoningEffort: "high", serviceTier: "priority" } } };
  const codexSb = cliRegistry.effectiveAgent({ adapter: "codex", cmd: "codex", args: [] }, sbCfg);
  assert.equal(codexSb.args[codexSb.args.indexOf("-s") + 1], "workspace-write", "workspace modunda codex -s workspace-write eklenmeli");
  assert.deepEqual(codexSb.args.slice(0, 2), ["exec", "--skip-git-repo-check"], "sandbox eklense de exec/skip-git ilk ikili kalmali");
  assert.deepEqual(codexSb.args.slice(-6), ["--model", "gpt-x", "-c", 'model_reasoning_effort="high"', "-c", 'service_tier="priority"'], "model/effort/tier sona kalmali");
  // off modu: hicbir sandbox bayragi eklenmez (eski davranis).
  const codexOff = cliRegistry.effectiveAgent({ adapter: "codex", cmd: "codex", args: [] }, { sandbox: { mode: "off" } });
  assert.ok(!codexOff.args.includes("workspace-write"), "off modunda sandbox bayragi eklenmemeli");
  // cfg'siz cagri (test/edge) hapissiz kalir; arguman-esitlik testleri bozulmaz.
  const codexNoCfg = cliRegistry.effectiveAgent({ adapter: "codex", cmd: "codex", args: [] });
  assert.ok(!codexNoCfg.args.includes("workspace-write"), "cfg verilmeyince sandbox eklenmemeli");
  // Kullanici kendi sandbox/bypass secimini koyduysa EZME (ikinci -s eklenmez).
  const codexUser = cliRegistry.effectiveAgent({ adapter: "codex", cmd: "codex", args: ["exec", "--skip-git-repo-check", "-s", "danger-full-access"] }, sbCfg);
  assert.equal(codexUser.args.filter((a) => a === "-s").length, 1, "kullanicinin -s secimi tek kalmali");
  assert.ok(!codexUser.args.includes("workspace-write"), "kullanici danger-full-access dediyse workspace-write eklenmemeli");
  // extraWritableDirs -> codex writable_roots config'ine cevrilir.
  const codexRoots = cliRegistry.effectiveAgent({ adapter: "codex", cmd: "codex", args: [] }, { sandbox: { mode: "workspace", extraWritableDirs: ["C:/shared", "  ", ""] } });
  const rootsArg = codexRoots.args.find((a) => String(a).startsWith("sandbox_workspace_write.writable_roots="));
  assert.ok(rootsArg && rootsArg.includes("C:/shared"), "extraWritableDirs writable_roots olarak gecmeli");
  assert.ok(!rootsArg.includes('"  "') && !rootsArg.includes('""'), "bos/whitespace yollar elenmeli");

  // buildCommand bare-shell dali: bosluk iceren yol argumanlari (--settings/--file) shell:true
  // altinda ikiye bolunmesin diye tirnaklanmali; sade bayrak/model adlari dokunulmamali.
  if (process.platform === "win32") {
    const bc = cliRegistry.buildCommand("claude", ["--settings", "C:\\a b\\x.json", "--model", "sonnet"]);
    assert.equal(bc.shell, true, "bare CLI shell:true olmali");
    assert.equal(bc.args[0], "--settings", "bosluksuz bayrak tirnaklanmamali");
    assert.equal(bc.args[1], '"C:\\a b\\x.json"', "bosluklu yol tirnaklanmali");
    assert.equal(bc.args[2], "--model", "model bayragi dokunulmamali");
    assert.equal(bc.args[3], "sonnet", "model adi tirnaklanmamali");
  }

  assert.deepEqual(cliRegistry.parseOpenCodeModels([
    "Available models:", "opencode/free-model", "opencode-go/paid-model", "ollama/qwen 2", "ollama/qwen2", "log: done",
  ].join("\n")), ["opencode/free-model", "opencode-go/paid-model", "ollama/qwen2"]);
  assert.equal(cliRegistry.selectOpenCodeModel(["opencode-go/paid-model"]), "opencode-go/paid-model");

  // Gemini "guvenilmeyen klasor"de --approval-mode yolo'yu sessizce default'a dusurur ve
  // otonom kosumda onay bekleyip sessizlik zaman asimina duser. --skip-trust bunu keser,
  // AMA yalnizca CLI bayragi destekliyorsa eklenmeli: eski surumlerde bilinmeyen bayrak her
  // calistirmayi kirar. Var olmayan bir binary --help veremez, yani bayrak eklenmemeli.
  const geminiUnknown = cliRegistry.effectiveAgent({ adapter: "gemini", cmd: "gemini-bulunmayan-binary", args: [] });
  assert.deepEqual(geminiUnknown.args, ["--approval-mode", "yolo"], "destegi dogrulanamayan bayrak eklenmemeli");

  // OpenCode model fallback: prob bos donerse son bilinen liste kullanilir (dropdown bos kalmasin).
  const fb = ["opencode/big-pickle", "opencode-go/pro"];
  const emptyProbe = cliRegistry.applyOpenCodeFallback({ id: "opencode", installed: true, models: [], ready: false, recommendedModel: "" }, fb);
  assert.deepEqual(emptyProbe.models, fb, "bos prob'ta fallback modelleri uygulanmali");
  assert.equal(emptyProbe.ready, true, "fallback ile ready true olmali");
  assert.equal(emptyProbe.recommendedModel, "opencode/big-pickle", "fallback'tan oneri secilmeli");
  assert.equal(emptyProbe.modelsFromCache, true, "fallback kullanildigi isaretlenmeli");
  // Taze modeller varsa fallback YOK SAYILIR (bayat listeyi taze listeye tercih etme).
  const freshProbe = cliRegistry.applyOpenCodeFallback({ id: "opencode", installed: true, models: ["opencode/new"], ready: true }, fb);
  assert.deepEqual(freshProbe.models, ["opencode/new"], "taze modeller korunmali");
  assert.ok(!freshProbe.modelsFromCache, "taze modelde cache isareti olmamali");
  // opencode disi CLI, bos fallback ve KURULU OLMAYAN opencode dokunulmaz (hayali model gosterme).
  assert.deepEqual(cliRegistry.applyOpenCodeFallback({ id: "codex", installed: true, models: [] }, fb).models, [], "opencode disi entry degismemeli");
  assert.deepEqual(cliRegistry.applyOpenCodeFallback({ id: "opencode", installed: true, models: [] }, []).models, [], "bos fallback ile degismemeli");
  assert.deepEqual(cliRegistry.applyOpenCodeFallback({ id: "opencode", installed: false, models: [] }, fb).models, [], "kurulu olmayan opencode'a fallback uygulanmamali");

  // Proje context (path'e ozel .crewctl/CONTEXT.md): oku/yaz/temizle round-trip.
  const ctxRoot = fs.mkdtempSync(path.join(require("os").tmpdir(), "crewctl-ctx-"));
  try {
    assert.equal(store.readProjectContext(ctxRoot), "", "context yokken bos string donmeli");
    assert.equal(store.writeProjectContext(ctxRoot, "# Proje\nMimari: X"), true, "yazma basarili olmali");
    assert.ok(store.projectContextPath(ctxRoot).replace(/\\/g, "/").endsWith(".crewctl/CONTEXT.md"), "yol .crewctl/CONTEXT.md olmali");
    assert.equal(store.readProjectContext(ctxRoot), "# Proje\nMimari: X", "yazilan icerik geri okunmali");
    assert.equal(store.writeProjectContext(ctxRoot, "# Proje v2"), true, "ustune yazma basarili olmali");
    assert.equal(store.readProjectContext(ctxRoot), "# Proje v2", "revize edilen icerik okunmali (append degil)");
    assert.equal(store.clearProjectContext(ctxRoot), true, "temizleme basarili olmali");
    assert.equal(store.readProjectContext(ctxRoot), "", "temizlendikten sonra bos donmeli");
    assert.equal(store.readProjectContext(""), "", "cwd bos ise guvenli bos string");
  } finally {
    fs.rmSync(ctxRoot, { recursive: true, force: true });
  }

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
  // --- Kesif onbellegi (acilis suresi) ---
  // Onbellek YALNIZCA kurulu bulunmus ve hala PATH/diskte duran CLI icin kullanilir.
  // Sahte bir onbellek girdisiyle davranisi CLI kurulumundan bagimsiz dogrulariz.
  const fakeCache = {
    version: 1,
    results: {
      // process.execPath daima mevcut: "kurulu ve yolu gecerli" senaryosu.
      codex: { installed: true, version: "onbellek-surumu", resolvedCommand: process.execPath },
      // Var olmayan yol: onbellek KULLANILMAMALI, yeniden yoklanmali.
      claude: { installed: true, version: "x", resolvedCommand: path.join(store.ROOT, "olmayan-ikili-dosya") },
      // opencode her zaman yoklanir (model/ready durumu degisebilir).
      opencode: { installed: true, version: "x", resolvedCommand: process.execPath },
    },
  };
  const cacheProbed = cliRegistry.discoverInstalled({ cache: fakeCache });
  const byId = Object.fromEntries(cacheProbed.map((c) => [c.id, c]));
  assert.equal(byId.codex.fromCache, true, "gecerli yolu olan onbellek girdisi kullanilmali");
  assert.equal(byId.codex.version, "onbellek-surumu");
  assert.ok(!byId.claude.fromCache, "yolu bulunamayan onbellek girdisi yeniden yoklanmali");
  assert.ok(!byId.opencode.fromCache, "opencode asla onbellekten gelmemeli");
  // Onbellekli acilista bayrak destegi de geri yuklenmeli. Aksi halde Gemini --skip-trust
  // yalnizca "Yeniden Tara" sonrasi eklenir, normal aciliste sessizce duserdi.
  const flagCache = {
    version: 1,
    checkedAt: new Date().toISOString(),
    results: { gemini: { installed: true, version: "x", resolvedCommand: process.execPath, supportedFlags: ["--skip-trust"] } },
  };
  cliRegistry.discoverInstalled({ cache: flagCache });
  const geminiCached = cliRegistry.effectiveAgent({ adapter: "gemini", cmd: process.execPath, args: [] });
  assert.ok(geminiCached.args.includes("--skip-trust"), "onbellekten gelen bayrak destegi uygulanmali");
  // force=true onbellegi tumden atlamali ("Yeniden Tara" dugmesi bu yolu kullanir).
  assert.ok(!cliRegistry.discoverInstalled({ cache: fakeCache, force: true }).some((c) => c.fromCache),
    "force=true iken hicbir sonuc onbellekten gelmemeli");
  // Uretilen onbellek gorunumu opencode'u ICERMEMELI.
  const produced = cliRegistry.discoveryCacheFrom([
    { id: "codex", installed: true, version: "1", resolvedCommand: "codex" },
    { id: "opencode", installed: true, version: "1", resolvedCommand: "opencode" },
    { id: "gemini", installed: false, version: "", resolvedCommand: "" },
  ]);
  assert.equal(produced.version, 1);
  assert.ok(produced.results.codex, "kurulu CLI onbellege yazilmali");
  assert.ok(!produced.results.opencode, "opencode onbellege yazilmamali");
  assert.ok(!produced.results.gemini, "kurulu olmayan CLI onbellege yazilmamali");

  // --- Probe iptal sayaci (saglik onbelleginin kirlenmesini onler) ---
  // Motor goreve baslarken probe'lari oldurur; oldurulen probe'un "basarisiz" sonucu
  // 6 saatlik saglik onbellegine YAZILMAMALIDIR. Sunucu bunu sayacin degisimiyle anlar.
  const generationBefore = cliRegistry.currentProbeGeneration();
  assert.equal(cliRegistry.abortActiveProbes(), 0, "aktif probe yokken 0 donmeli");
  assert.equal(cliRegistry.currentProbeGeneration(), generationBefore,
    "oldurulen probe yokken sayac artmamali (bos iptal saglik sonucunu gecersiz kilmamali)");

  console.log("cli flow ok");
}

main();
