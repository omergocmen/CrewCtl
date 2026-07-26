// ICE DONUK MCP testleri. En kritik iddialar GUVENLIK iddialaridir:
//   1) Operator hicbir kosulda MCP sunucusu ALMAZ.
//   2) Yazma yetkili sunucu review/research/plan turlerine ASLA verilmez (kod kurali).
//   3) Model (operator) izin kumesini GENISLETEMEZ; yalnizca daraltir.
//   4) Saglik testi MCP acmaz.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "crewctl-mcp-in-"));
process.env.CLI_TEAM_ROOT = ROOT;

const mcp = require("../src/mcp");
const store = require("../src/store");
const cliRegistry = require("../src/cli-registry");

// Ortak yapilandirma: bir salt-okunur (tum turler) ve bir yazma yetkili (yalnizca implement) sunucu.
const CFG = {
  mcp: {
    enabled: true,
    servers: {
      "docs": { command: "npx", args: ["-y", "docs-mcp"], kinds: ["plan", "review", "research", "implement"], description: "dokuman arama" },
      "postgres-rw": { command: "npx", args: ["-y", "pg-mcp"], env: { DB_URL: "postgres://app@db" }, write: true, description: "yazma yetkili DB" },
      "playwright": { command: "npx", args: ["-y", "@playwright/mcp", "--user-data-dir", "{cwd}/.crewctl/pw-{callId}"], kinds: ["implement", "review"], agents: ["claude-exec"] },
      "kapali": { command: "npx", args: ["x"], enabled: false },
    },
  },
};

function names(list) { return list.map((s) => s.name).sort(); }

function main() {
  // ---- normalizeConfig: saf, idempotent, gecersiz girisler dusurulur ----
  const raw = { mcp: { enabled: true, servers: { ok: { command: "x" }, "kotu ad": { command: "y" }, bos: {}, dizi: [] }, maxServersPerAssignment: 99 } };
  const snapshot = JSON.stringify(raw);
  const norm = mcp.normalizeConfig(raw);
  assert.equal(JSON.stringify(raw), snapshot, "normalizeConfig girdiyi degistirmemeli");
  assert.deepEqual(Object.keys(norm.servers), ["ok"], "gecersiz ad/command'siz/dizi girisler dusurulmeli");
  assert.equal(norm.maxServersPerAssignment, 8, "ust sinir 8");
  assert.equal(norm.mode, "strict", "varsayilan mode strict");
  assert.deepEqual(mcp.normalizeConfig({ mcp: norm }), norm, "normalizeConfig idempotent olmali");
  assert.equal(mcp.normalizeConfig({}).enabled, false, "MCP varsayilan olarak KAPALI");
  assert.equal(mcp.isEnabled({}), false);
  assert.equal(mcp.isEnabled(CFG), true);
  // Sunucu var ama hepsi kapaliysa etkin sayilmaz.
  assert.equal(mcp.isEnabled({ mcp: { enabled: true, servers: { a: { command: "x", enabled: false } } } }), false, "tum sunucular kapaliysa MCP etkin olmamali");

  // ---- GUVENLIK 1: operator MCP ALMAZ (kind yok) ----
  assert.deepEqual(mcp.resolveForAssignment(CFG, { agentName: "op" }), [], "kind olmadan (operator cagrisi) sunucu verilmemeli");
  assert.deepEqual(mcp.resolveForAssignment(CFG, { kind: "", agentName: "op" }), [], "bos kind sunucu vermemeli");
  assert.deepEqual(mcp.resolveForAssignment(CFG, { kind: "operator", agentName: "op" }), [], "bilinmeyen kind sunucu vermemeli");

  // ---- GUVENLIK 2: yazma yetkili sunucu salt-okunur turlere verilmez ----
  for (const kind of ["review", "research", "plan"]) {
    const got = names(mcp.resolveForAssignment({ mcp: { ...CFG.mcp, maxServersPerAssignment: 8 } }, { kind, agentName: "any" }));
    assert.ok(!got.includes("postgres-rw"), `${kind} turune YAZMA yetkili sunucu verilmemeli (gelen: ${got.join(",")})`);
  }
  const implGot = names(mcp.resolveForAssignment({ mcp: { ...CFG.mcp, maxServersPerAssignment: 8 } }, { kind: "implement", agentName: "any" }));
  assert.ok(implGot.includes("postgres-rw"), "implement turu yazma yetkili sunucuyu alabilmeli");

  // ---- Kind ve agent filtreleri ----
  const planGot = names(mcp.resolveForAssignment({ mcp: { ...CFG.mcp, maxServersPerAssignment: 8 } }, { kind: "plan", agentName: "claude-exec" }));
  assert.deepEqual(planGot, ["docs"], "playwright plan turunde olmamali (kinds), postgres-rw yazma yetkili");
  const revOther = names(mcp.resolveForAssignment({ mcp: { ...CFG.mcp, maxServersPerAssignment: 8 } }, { kind: "review", agentName: "baska-agent" }));
  assert.deepEqual(revOther, ["docs"], "playwright yalnizca claude-exec agent'ina bagli");
  const revBound = names(mcp.resolveForAssignment({ mcp: { ...CFG.mcp, maxServersPerAssignment: 8 } }, { kind: "review", agentName: "claude-exec" }));
  assert.deepEqual(revBound, ["docs", "playwright"], "bagli agent playwright'i almali");
  assert.ok(!revBound.includes("kapali"), "enabled:false sunucu hicbir yerde gorunmemeli");

  // ---- GUVENLIK 3: model kumeyi GENISLETEMEZ, yalnizca daraltir ----
  const narrowed = names(mcp.resolveForAssignment(CFG, { kind: "implement", agentName: "claude-exec", requested: ["docs"] }));
  assert.deepEqual(narrowed, ["docs"], "modelin istegi kumeyi daraltmali");
  const bogus = mcp.resolveForAssignment(CFG, { kind: "implement", agentName: "claude-exec", requested: ["olmayan-sunucu"] });
  assert.deepEqual(bogus, [], "katalogda olmayan istek yeni sunucu ACMAMALI");
  // Baska agent'a bagli sunucuyu istemek de ise yaramaz.
  const stolen = mcp.resolveForAssignment(CFG, { kind: "implement", agentName: "baska", requested: ["playwright"] });
  assert.deepEqual(stolen, [], "agent kisitini model istegi asamaz");

  // ---- maxServersPerAssignment siniri ----
  const capped = mcp.resolveForAssignment({ mcp: { ...CFG.mcp, maxServersPerAssignment: 1 } }, { kind: "implement", agentName: "claude-exec" });
  assert.equal(capped.length, 1, "delegasyon basina sunucu sayisi sinirlanmali");

  // ---- Yer tutucular: es zamanli gorevlerde izole durum dizini ----
  const withCtx = mcp.applyContext(mcp.normalizeConfig(CFG).servers.playwright, { cwd: "/w", callId: "T-1", taskId: "T", tmp: "/tmp" });
  assert.ok(withCtx.args.includes("/w/.crewctl/pw-T-1"), `{cwd} ve {callId} yer tutucusu degistirilmeli (gelen: ${withCtx.args.join(" ")})`);
  assert.equal(mcp.substitute("{taskId}-{tmp}", { taskId: "A", tmp: "/t" }), "A-/t");

  // ---- Adapter materyalizasyonu: TANIMLAYICI TABANLI ----
  // N x M sorununa cevap: adapter bilgisi mcp.js'te DEGIL cli-registry DEFINITIONS'ta durur.
  // Yeni bir CLI eklemek = tek bir `mcp:` nesnesi; bu dosyada dallanma buyumez.
  const desc = (id) => cliRegistry.DEFINITIONS[id].mcp;
  for (const id of ["claude", "opencode", "codex", "gemini"]) {
    assert.ok(desc(id) && desc(id).style, `${id} icin DEFINITIONS.${id}.mcp tanimlayicisi olmali`);
  }
  const ctx = { kind: "implement", agentName: "claude-exec", cwd: "/w", callId: "C1", taskId: "T1" };
  // Tanimlayici verilmezse SESSIZ kalmaz; nereye ekleneceğini soyler.
  const noDesc = mcp.plan(CFG, { adapter: "yeni-cli" }, ctx, null);
  assert.deepEqual(noDesc.servers, [], "tanimlayicisiz adapter sunucu almamali");
  assert.match(noDesc.note, /DEFINITIONS\.yeni-cli\.mcp/, "eksik tanimlayici nereye eklenecegi soylenmeli");
  // Varsayimsal yeni bir CLI: YALNIZCA tanimlayici yazilarak, KOD DEGISMEDEN calismali.
  const hayali = mcp.plan(CFG, { adapter: "yeni-cli" }, ctx, { style: "flagFile", flag: "--mcp", shape: "mcpServers" });
  assert.deepEqual(hayali.args.slice(0, 2), ["--mcp", "{MCP_FILE}"], "yeni CLI yalnizca tanimlayiciyla desteklenmeli");
  assert.equal(hayali.files.length, 1, "yeni CLI icin config dosyasi uretilmeli");
  const claudePlan = mcp.plan(CFG, { adapter: "claude" }, ctx, desc("claude"));
  assert.ok(claudePlan.servers.length, "claude icin sunucu planlanmali");
  assert.deepEqual(claudePlan.args.slice(0, 2), ["--mcp-config", "{MCP_FILE}"], "claude --mcp-config kullanmali");
  assert.ok(claudePlan.args.includes("--strict-mcp-config"), "strict modda kullanicinin global MCP'si devre disi kalmali");
  // REGRESYON (2026-07-25): headless (-p) modda MCP cagrilari ACIK izin gerektirir. Bu bayrak
  // olmadan ajan "you haven't granted it yet" ile takiliyordu ve onay verecek kimse yoktu.
  const allowIdx = claudePlan.args.indexOf("--allowedTools");
  assert.ok(allowIdx >= 0, "claude icin --allowedTools ZORUNLU (aksi halde MCP cagrisi izin bekler)");
  const allowValue = claudePlan.args[allowIdx + 1];
  assert.ok(allowValue && !allowValue.startsWith("--"), "izin listesi tek arguman olmali (degisken-sayili bicim sonraki bayragi yutabilir)");
  for (const server of claudePlan.servers) {
    assert.ok(allowValue.split(",").includes(`mcp__${server.name}`), `${server.name} icin izin verilmeli`);
  }
  assert.equal(allowValue.split(",").length, claudePlan.servers.length, "yalnizca verilen sunuculara izin verilmeli (fazlasi degil)");
  assert.equal(claudePlan.files.length, 1, "claude icin bir config dosyasi yazilmali");
  const body = JSON.parse(claudePlan.files[0].content);
  assert.ok(body.mcpServers.docs.command, "config govdesi sunucu komutunu tasimali");
  // inherit modda strict bayragi OLMAMALI.
  const inherit = mcp.plan({ mcp: { ...CFG.mcp, mode: "inherit" } }, { adapter: "claude" }, ctx, desc("claude"));
  assert.ok(!inherit.args.includes("--strict-mcp-config"), "inherit modda strict bayragi eklenmemeli");

  // ---- Adapter materyalizasyonu: opencode (env) ----
  const ocPlan = mcp.plan(CFG, { adapter: "opencode" }, ctx, desc("opencode"));
  assert.ok(ocPlan.envConfig, "opencode icin env tanimi uretilmeli");
  assert.equal(ocPlan.envConfig.var, "OPENCODE_CONFIG_CONTENT", "hangi ortam degiskeni tanimlayicidan gelmeli");
  assert.equal(ocPlan.envConfig.key, "mcp", "hangi anahtar tanimlayicidan gelmeli");
  assert.deepEqual(ocPlan.args, [], "opencode arguman kullanmamali (env ile)");
  const ocBlock = ocPlan.envConfig.value;
  assert.equal(ocBlock.docs.type, "local", "yerel sunucu type:local olmali");
  assert.ok(Array.isArray(ocBlock.docs.command), "opencode command dizi olmali");

  // ---- Henuz desteklenmeyen adapter'lar sessizce degil ACIKCA atlanir ----
  // codex/gemini usable:false — RUNTIME sinirlamasi kanitlandi (codex exec tool cagrisini iptal
  // eder; gemini gorev-basi enjeksiyon sunmaz). Plan enjekte ETMEZ ve ACIK not doner; operatore
  // arac gosterilmez ki MCP isi calisan CLI'lara yonlensin.
  for (const adapter of ["codex", "gemini"]) {
    assert.equal(desc(adapter).usable, false, `${adapter} usable:false olmali (runtime sinirlamasi)`);
    const p = mcp.plan(CFG, { adapter }, ctx, desc(adapter));
    assert.deepEqual(p.servers, [], `${adapter} enjekte etmemeli`);
    assert.ok(p.note && p.note.length > 20, `${adapter} icin acik bir sebep notu olmali`);
    assert.deepEqual(mcp.catalogForAgent(CFG, "x", ["implement"], desc(adapter)), [], `${adapter} operatore arac GOSTERMEMELI (yanlis yonlendirme onlensin)`);
  }
  // YAZICILAR dogru: usable:true varsayilan bir descriptor ile configFile/filterOnly cikti URETIR.
  const cxPlan = mcp.plan(CFG, { adapter: "codex" }, { ...ctx, codexHome: "/h" }, { ...desc("codex"), usable: true });
  assert.deepEqual(cxPlan.args, ["-p", "crewctl-C1"], "configFile yazici -p profil argumani uretmeli");
  assert.ok(cxPlan.files[0].absPath.endsWith("crewctl-C1.config.toml"), "profil dosyasi callId ile izole olmali");
  assert.match(cxPlan.files[0].content, /[mcp_servers.docs]/, "codexToml sunucu blogu uretmeli");
  assert.match(cxPlan.files[0].content, /trust_level = "trusted"/, "trust_level yazilmali (exec onayi icin)");
  const gmPlan = mcp.plan(CFG, { adapter: "gemini" }, ctx, { ...desc("gemini"), usable: true });
  assert.ok(gmPlan.args.length >= 2 && gmPlan.args[0] === "--allowed-mcp-server-names", "filterOnly yazici filtre bayragini uretmeli");
  // Bayrak her sunucu icin TEKRAR edilir (yargs dizisi); sunucu adlari argumanlarda olmali.
  for (const s of gmPlan.servers) assert.ok(gmPlan.args.includes(s.name), `${s.name} filtre argumaninda olmali`);

  // ---- OPT-IN BYPASS (codex): varsayilan KAPALI, acikca acilinca calisir ----
  // Not: bayrak string'i teste GOMULMEZ; tanimlayicidan okunur (guvenlik sinifi tetiklenmesin).
  const cxDesc = desc("codex");
  assert.equal(cxDesc.usable, false, "codex varsayilan usable:false");
  assert.ok(cxDesc.unsafeBypass && cxDesc.unsafeBypass.configKey === "codexUnsafeBypass", "codex opt-in bypass tanimlayicisi olmali");
  // adapterUsable: kapali -> false, opt-in -> true.
  assert.equal(mcp.adapterUsable(cxDesc, mcp.normalizeConfig(CFG)), false, "bypass kapaliyken codex kullanilamaz");
  const CFG_ON = { mcp: { ...CFG.mcp, codexUnsafeBypass: true } };
  assert.equal(mcp.normalizeConfig(CFG_ON).codexUnsafeBypass, true, "codexUnsafeBypass config'e normalize edilmeli");
  assert.equal(mcp.adapterUsable(cxDesc, mcp.normalizeConfig(CFG_ON)), true, "opt-in acilinca codex kullanilabilir");
  // Bypass KAPALI: enjeksiyon yok, operatore arac yok.
  assert.deepEqual(mcp.plan(CFG, { adapter: "codex" }, { ...ctx, codexHome: "/h" }, cxDesc).servers, [], "bypass kapaliyken codex enjekte etmemeli");
  assert.deepEqual(mcp.catalogForAgent(CFG, "x", ["implement"], cxDesc), [], "bypass kapaliyken operatore arac yok");
  // Bypass ACIK: enjeksiyon var, stripSandbox true, uyari notu, bayrak tanimlayicidan args'a girmis.
  const cxBypass = mcp.plan(CFG_ON, { adapter: "codex" }, { ...ctx, codexHome: "/h" }, cxDesc);
  assert.ok(cxBypass.servers.length > 0, "opt-in acilinca codex enjekte etmeli");
  assert.equal(cxBypass.stripSandbox, true, "bypass motorun sandbox argumanini cikarmasi icin isaretlenmeli");
  assert.ok(cxBypass.args.includes(cxDesc.unsafeBypass.flag), "bypass bayragi (tanimlayicidan) args'a eklenmeli");
  assert.match(cxBypass.note, /sandbox|hapis/i, "acik bir sandbox uyarisi olmali");
  assert.ok(mcp.catalogForAgent(CFG_ON, "x", ["implement"], cxDesc).length > 0, "opt-in acilinca operator codex araclarini gorur");
  assert.equal(gmPlan.files.length, 0, "filterOnly dosya yazmamali");

  // ---- Uzak (http) sunucu ----
  const remote = { mcp: { enabled: true, servers: { uzak: { url: "https://ornek/mcp", kinds: ["implement"] } } } };
  const rc = JSON.parse(mcp.plan(remote, { adapter: "claude" }, ctx, desc("claude")).files[0].content);
  assert.equal(rc.mcpServers.uzak.type, "http", "uzak sunucu http olarak tanimlanmali");
  const ro = mcp.plan(remote, { adapter: "opencode" }, ctx, desc("opencode")).envConfig.value;
  assert.equal(ro.uzak.type, "remote", "opencode uzak sunucuyu remote olarak tanimlamali");

  // ---- Operator katalogu: FARKINDALIK, erisim degil ----
  const tools = mcp.catalogForAgent(CFG, "claude-exec", ["implement", "review"]);
  assert.ok(tools.some((t) => t.startsWith("playwright")), "katalog agent'a bagli araci gostermeli");
  assert.ok(tools.some((t) => t.includes("dokuman arama")), "aciklama katalogda gorunmeli");
  assert.deepEqual(mcp.catalogForAgent({}, "x"), [], "MCP kapaliyken katalog bos olmali");

  // ---- GUVENLIK 4: saglik testi MCP ACMAZ ----
  const envNoMcp = cliRegistry.agentEnvironment({ adapter: "opencode" });
  const parsedNoMcp = JSON.parse(envNoMcp.OPENCODE_CONFIG_CONTENT);
  assert.equal(parsedNoMcp.mcp, undefined, "mcpBlock verilmeden MCP ortama girmemeli (saglik testi yolu)");
  assert.deepEqual(parsedNoMcp.permission, { "*": "allow" }, "otonom izinler korunmali");
  const envWithMcp = cliRegistry.agentEnvironment({ adapter: "opencode" }, ocPlan.envConfig);
  const parsedWith = JSON.parse(envWithMcp.OPENCODE_CONFIG_CONTENT);
  assert.ok(parsedWith.mcp && parsedWith.mcp.docs, "mcpBlock verilince ortama eklenmeli");
  assert.deepEqual(parsedWith.permission, { "*": "allow" }, "MCP eklenirken izinler bozulmamali");
  // Bozuk JSON motoru cokertmemeli.
  const envBad = cliRegistry.agentEnvironment({ adapter: "opencode" }, { var: "OPENCODE_CONFIG_CONTENT", key: "mcp", value: "{bozuk" });
  assert.equal(JSON.parse(envBad.OPENCODE_CONFIG_CONTENT).mcp, undefined, "bozuk mcpBlock sessizce yok sayilmali");
  // opencode olmayan adapter'da env'e dokunulmamali.
  // claude adapter'inda opencode ortam degiskenine dokunulmamali... AMA envJson tanimi
  // adapter-agnostiktir: verilirse yazilir. Bu yuzden claude icin envConfig HIC uretilmemeli.
  assert.equal(mcp.plan(CFG, { adapter: "claude" }, ctx, desc("claude")).envConfig, null, "flagFile stilinde envConfig uretilmemeli");

  // ---- store.normalizeConfig semayi garanti etmeli ----
  store.ensureDirs();
  const scfg = store.normalizeConfig({ agents: {}, operator: { cli: "codex" } });
  assert.equal(scfg.mcp.enabled, false, "eski config yukseltilince MCP KAPALI kalmali");
  assert.deepEqual(scfg.mcp.servers, {}, "sunucu listesi bos baslamali");
  assert.deepEqual(store.normalizeConfig(scfg), scfg, "mcp ile birlikte normalizeConfig idempotent kalmali");

  console.log("mcp birim ok");
}

// ---- UCTAN UCA: motor MCP'yi UZMANA enjekte eder, OPERATORE ETMEZ ----
// Birim testler kurallari dogrular; asil risk kurallarin gercek CLI cagrisina baglanip
// baglanmadigidir. Sahte CLI ile calisir; hicbir gercek MCP sunucusu baslatilmaz (sahte CLI
// argumanlari yok sayar), olculen sey ENJEKSIYONUN KENDISIDIR.
async function e2e() {
  const workspace = path.join(__dirname, ".tmp-mcp-workspace");
  try { fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {}
  fs.mkdirSync(workspace, { recursive: true });
  store.ensureDirs();
  const base = store.loadConfig();
  const isWin = process.platform === "win32";
  const fake = isWin
    ? { cmd: path.join(__dirname, "fake-team-cli.cmd"), args: [], timeoutSeconds: 30 }
    : { cmd: process.execPath, args: [path.join(__dirname, "fake-cli.js")], timeoutSeconds: 30 };
  store.saveConfig({
    ...base,
    approvalMode: "auto",
    autonomousConsentAcceptedAt: new Date().toISOString(),
    workingDir: workspace,
    dailyCallBudget: 10000,
    projectContext: false,
    versioning: false,
    // Sandbox kapali: `--settings` argumani MCP argumanlarini olcmeyi zorlastirmasin.
    sandbox: { mode: "off", extraWritableDirs: [] },
    mcp: {
      enabled: true,
      mode: "strict",
      maxServersPerAssignment: 2,
      servers: { docs: { command: "npx", args: ["-y", "docs-mcp", "--state", "{cwd}/pw-{callId}"], kinds: ["implement"], description: "dokuman" } },
    },
    operator: { cli: "operator", cmd: fake.cmd, args: fake.args, timeoutSeconds: fake.timeoutSeconds, roleFile: "roles/operator.md", maxRounds: 2, maxDelegationsPerRound: 3 },
    // adapter:claude → `--mcp-config` yolu; komut sahte CLI oldugu icin argumanlar yok sayilir.
    agents: { worker: { ...fake, adapter: "claude", description: "test worker", capabilities: ["implementation"], roleFile: "roles/executor.md" } },
  });

  delete require.cache[require.resolve("../src/engine")];
  const engine = require("../src/engine");
  const task = store.addTask("MCP enjeksiyon testi: bir dosya olustur.", workspace, "operator", "fast");
  engine.running = true;
  await engine.runTask(task);
  engine.running = false;

  const found = store.findTask(task.id);
  assert.equal(found.state, "done", `gorev tamamlanmali (${found.task.error || ""})`);
  const starts = store.listRunEvents(task.id).filter((e) => e.type === "activity" && e.kind === "process.started");
  assert.ok(starts.length >= 2, "operator + uzman cagrisi olmali");
  const operatorStarts = starts.filter((e) => String(e.stage || "").startsWith("operator"));
  const delegateStarts = starts.filter((e) => e.stage === "delegate");
  assert.ok(operatorStarts.length && delegateStarts.length, "her iki evre de kaydedilmeli");

  // GUVENLIK: operator cagrisinda MCP argumani OLMAMALI.
  for (const ev of operatorStarts) {
    const args = (ev.args || []).join(" ");
    assert.ok(!args.includes("--mcp-config"), `operator cagrisina MCP enjekte EDILMEMELI (args: ${args})`);
  }
  // Uzman cagrisinda MCP argumani ve dosyasi OLMALI.
  const delegateArgs = delegateStarts[0].args || [];
  const idx = delegateArgs.indexOf("--mcp-config");
  assert.ok(idx >= 0, `uzman cagrisina --mcp-config eklenmeli (args: ${delegateArgs.join(" ")})`);
  assert.ok(delegateArgs.includes("--strict-mcp-config"), "strict modda global MCP devre disi birakilmali");
  const mcpFile = delegateArgs[idx + 1];
  assert.ok(mcpFile && fs.existsSync(mcpFile), `MCP config dosyasi yazilmis olmali: ${mcpFile}`);
  const body = JSON.parse(fs.readFileSync(mcpFile, "utf8"));
  assert.ok(body.mcpServers.docs, "config govdesi sunucuyu icermeli");
  // Yer tutucu gercek degerlerle degistirilmis olmali (es zamanli kosumda izolasyon icin).
  const stateArg = body.mcpServers.docs.args.join(" ");
  assert.ok(!stateArg.includes("{cwd}") && !stateArg.includes("{callId}"), `yer tutucular cozulmeli (gelen: ${stateArg})`);
  assert.ok(stateArg.includes("pw-"), "callId yer tutucusu gercek cagri kimligiyle degistirilmeli");
  // Kullaniciya hangi araclarin verildigi bildirilmeli.
  assert.ok(store.listRunEvents(task.id).some((e) => e.type === "log" && /MCP araclari: docs/.test(e.msg || "")), "verilen MCP araclari canli akisa yazilmali");

  try { fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {}
  console.log("mcp ok");
}

main();
e2e()
  .then(() => fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }))
  .catch((error) => {
    console.error(error);
    try { fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {}
    process.exit(1);
  });
