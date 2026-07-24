const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const isWin = process.platform === "win32";

const DEFINITIONS = {
  codex: {
    command: "codex",
    versionArgs: ["--version"],
    defaultArgs: ["exec", "--skip-git-repo-check"],
    // Codex calisirken surekli ilerleme akitir; 3 dakikalik sessizlik gercek bir takilmadir.
    silenceTimeoutSeconds: 180,
    description: "OpenAI Codex kodlama, hata ayiklama ve inceleme agenti",
    capabilities: ["implementation", "debugging", "testing", "review", "analysis"],
    roleFile: "roles/executor.md",
  },
  claude: {
    command: "claude",
    versionArgs: ["--version"],
    // stream-json + --verbose: claude 'text'/'json' modunda uzun isi TOPLU (tek seferde) doker;
    // ara adimlarda stdout sessiz kalir ve motorun sessizlik sayaci calisan kosmayi yanlislikla
    // oldururdu. stream-json her adimda (assistant mesaji, tool cagrisi/sonucu) olay akitir; boylece
    // sessizlik sifirlanir. Nihai metin + kullanim son "result" olayindan ayiklanir.
    defaultArgs: ["-p", "--permission-mode", "acceptEdits", "--output-format", "stream-json", "--verbose"],
    // Claude artik akitiyor; kisa sessizlik esigi guvenli. (sizeFactor buyuk gorevde yine acar.)
    silenceTimeoutSeconds: 240,
    description: "Claude Code uygulama, analiz ve test agenti",
    capabilities: ["implementation", "debugging", "testing", "review", "web"],
    roleFile: "roles/executor.md",
  },
  gemini: {
    command: "gemini",
    versionArgs: ["--version"],
    // Argumansiz gemini interaktif TUI acar ve izin bekler; yolo ile otonom, stdin'den prompt alir.
    defaultArgs: ["--approval-mode", "yolo"],
    // Gemini de akis halinde cikti verir; uzun sessizlik takilma isaretidir.
    silenceTimeoutSeconds: 180,
    // --skip-trust her Gemini surumunde yok; kesifte yoklanip destekleniyorsa eklenir.
    optionalFlags: ["--skip-trust"],
    description: "Gemini CLI analiz, uygulama ve web arastirma agenti",
    capabilities: ["implementation", "planning", "analysis", "research", "web"],
    roleFile: "roles/executor.md",
  },
  opencode: {
    command: "opencode",
    versionArgs: ["--version"],
    // OpenCode saglayici/model kombinasyonuna gore uzun sure sessiz kalabilir. Varsayilan
    // agent timeout'u, basarili bir calismayi SIGTERM ile yarida kesmeyecek kadar genis tut.
    timeoutSeconds: 1800,
    // OpenCode adim baslattiktan sonra model/provider yanitini beklerken uzun sure hic cikti
    // akitmayabilir (ozellikle yavas/rate-limitli modeller). 180sn cok agresifti ve calisan bir
    // kosmayi yariyordu; sessizlik payini genis tut. Gercek takilma yine timeoutSeconds ile yakalanir.
    silenceTimeoutSeconds: 300,
    // Bazi eski OpenCode surumleri --auto bayragini tanimaz. Otonom izinler
    // engine tarafinda OPENCODE_CONFIG_CONTENT ile surumden bagimsiz aktarilir.
    defaultArgs: ["run", "--format", "json", "Attached file contains the full task. Follow it exactly, make the changes, and report what you did.", "--file", "{PROMPT_FILE}"],
    description: "OpenCode coklu saglayici kodlama, uygulama ve inceleme agenti",
    capabilities: ["implementation", "debugging", "testing", "review", "analysis", "research"],
    roleFile: "roles/executor.md",
    install: {
      windows: "npm install -g opencode-ai  (alternatif: choco install opencode / scoop install opencode)",
      macos: "brew install anomalyco/tap/opencode  (alternatif: npm install -g opencode-ai)",
      linux: "curl -fsSL https://opencode.ai/install | bash  (alternatif: npm install -g opencode-ai)",
      auth: "opencode auth login",
    },
  },
};
const RESOLVED = new Map();
let OPEN_CODE_MODELS = [];

// En fazla bir CLI'yi (or. codex) ayni anda hem canli saglik/model probe'u hem de motorun
// operatör kosumu calistirirsa, codex gibi bazi CLI'lar ayni is dizininde ikinci exec oturumunu
// SIGTERM ile keser. Probe'lar "en iyi caba"dir; motor onceliklidir. Aktif probe cocuklarini
// izleyip motor bir goreve baslarken hepsini sonlandiriyoruz.
const ACTIVE_PROBES = new Set();
function registerProbe(child) {
  if (!child) return () => {};
  ACTIVE_PROBES.add(child);
  return () => ACTIVE_PROBES.delete(child);
}
// Uctan uca proses agacini oldur (codex kabuk altinda alt proses baslatabilir).
function terminateProbeTree(child) {
  if (!child) return;
  try {
    if (isWin && child.pid) spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    else child.kill("SIGKILL");
  } catch {}
}
// Motor bir goreve baslarken cagirir: uctaki tum canli probe'lari sonlandirir ki operatörun
// CLI'si (codex vb.) temiz bir alanda calissin. Probe'lar sonuc olarak "timeout/failed" doner;
// bu zararsizdir, motor bosaldiginda yeniden denenir.
// Iptal sayaci: motor bir goreve baslarken probe'lari oldurdugunde artar. Oldurulen probe
// "cikis kodu != 0" ile doner ve saglik siniflandiricisi bunu GERCEK bir ariza sanardi;
// sonuc 6 saatlik onbellege yazilinca CLI o sure boyunca yanlislikla kullanilamaz kalirdi.
// refreshCliHealth bu sayaci once/sonra karsilastirip kirlenmis sonucu ONBELLEGE YAZMAZ.
let probeGeneration = 0;
function currentProbeGeneration() {
  return probeGeneration;
}

function abortActiveProbes() {
  const count = ACTIVE_PROBES.size;
  if (count) probeGeneration++;
  for (const child of ACTIVE_PROBES) terminateProbeTree(child);
  ACTIVE_PROBES.clear();
  return count;
}

// Saglayici adlari koda gomulmez: kullanicinin aboneligi farkli olabilir ve katalog degisir.
// Sirali joker desenler; ilk eslesen kazanir. cliSettings.opencode uzerinden degistirilebilir.
const DEFAULT_OPENCODE_MODEL_PREFERENCES = ["*deepseek*free*", "*free*", "*"];
// Yerel/LAN saglayicilar erisilebilir varsayilamaz: kapali bir Ollama "Unable to connect" verir.
const DEFAULT_OPENCODE_MODEL_EXCLUDE = ["ollama/*", "lmstudio/*", "llamacpp/*", "local/*", "localhost/*"];

// Kullanici deseni regex ozel karakteri icerse bile duz metin sayilmali.
function globToRegExp(pattern) {
  const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}
function patternList(value, fallback) {
  const list = Array.isArray(value) ? value.map(String).map((x) => x.trim()).filter(Boolean) : [];
  return (list.length ? list : fallback).map(globToRegExp);
}

function selectOpenCodeModel(models, settings = {}) {
  const list = Array.isArray(models) ? models.map(String).filter(Boolean) : [];
  const exclude = patternList(settings.modelExclude, DEFAULT_OPENCODE_MODEL_EXCLUDE);
  const preferences = patternList(settings.modelPreferences, DEFAULT_OPENCODE_MODEL_PREFERENCES);
  const usable = list.filter((model) => !exclude.some((rule) => rule.test(model)));
  for (const rule of preferences) {
    const found = usable.find((model) => rule.test(model));
    if (found) return found;
  }
  return "";
}

// `opencode models` ciktisindan saglayici/model satirlarini ayiklar. Baslik, bos satir ve
// log gurultusunu eler; her "saglayici/model" bicimli satir gecerli sayilir.
function parseOpenCodeModels(stdout) {
  const found = new Set();
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const model = line.trim();
    if (/^[A-Za-z0-9._-]+\/.+/.test(model) && !/\s/.test(model)) found.add(model);
  }
  return [...found];
}

function listOpenCodeModels(command) {
  try {
    // Tum saglayicilarin listesi sorgulanir. Kullanicilarin ucretli abonelikleri
    // (opencode-go, minimax-coding-plan vb.) ayri saglayici olarak gorunur; yalnizca
    // "opencode" saglayicisini sorgulamak bu modelleri gizliyor ve kurulum yanlislikla
    // "hazir degil" sayiliyordu. Otomatik oneri siralamasini selectOpenCodeModel yapar.
    const result = spawnSync(command, ["models"], {
      encoding: "utf8", timeout: 20000, windowsHide: true,
      shell: isWin && (!path.isAbsolute(command) || /\.(cmd|bat)$/i.test(command)),
    });
    if (result.status !== 0) return [];
    return parseOpenCodeModels(result.stdout);
  } catch { return []; }
}

// Liste bos kalirsa --model eklenmez ve opencode kendi "son kullanilan" modeline duser; o model
// erisilemezse gorev "No provider available"/"Unable to connect" ile olur. Bu yuzden tembel doldurulur.
let openCodeModelsAttempted = false;
function ensureOpenCodeModels(command) {
  // Negatif sonuc da onbelleklenir: aksi halde bos donduren bir kurulumda her effectiveAgent
  // cagrisi yeniden spawn eder ve istek yolunda event loop'u kilitlerdi.
  if (OPEN_CODE_MODELS.length || openCodeModelsAttempted) return OPEN_CODE_MODELS;
  openCodeModelsAttempted = true;
  OPEN_CODE_MODELS = listOpenCodeModels(RESOLVED.get("opencode") || command || "opencode");
  return OPEN_CODE_MODELS;
}

// Oturum acma talimati CLI'ya gore degisir; tek bir sabit metin opencode hatasinda kullaniciya
// gemini komutu onerdiriyordu. Adapter adi ya da komut yolu kabul eder.
const AUTH_HINTS = {
  codex: "Terminalde `codex login` calistirin (veya OPENAI_API_KEY tanimlayin).",
  claude: "Terminalde `claude` calistirip oturum acin (veya ANTHROPIC_API_KEY tanimlayin).",
  gemini: "Terminalde `gemini` calistirip 'Login with Google' secin (veya GEMINI_API_KEY tanimlayin).",
  opencode: "Terminalde `opencode auth login` calistirip saglayiciyi secin; '401 No provider available' hatasi secili modelin saglayicisinda gecerli kimlik olmadigi anlamina gelir.",
};
function authHint(adapterOrCommand) {
  const id = AUTH_HINTS[adapterOrCommand] ? adapterOrCommand : adapterId(adapterOrCommand);
  return AUTH_HINTS[id] || "Bu CLI'nin kendi oturum acma komutunu terminalde calistirin.";
}

function adapterId(command) {
  const base = path.basename(String(command || "")).toLowerCase().replace(/\.(cmd|bat|exe|ps1)$/, "");
  if (base.includes("codex")) return "codex";
  if (base.includes("claude")) return "claude";
  if (base.includes("gemini")) return "gemini";
  if (base.includes("opencode")) return "opencode";
  return "custom";
}

// Farkli paket yoneticileri / kurulum araclari CLI'lari farkli dizinlere koyar. Her PC'de
// calismasi icin yaygin npm/pnpm/yarn/bun/volta/scoop/winget/choco/homebrew konumlarini tarariz.
function commonCandidates(id) {
  const home = os.homedir();
  if (isWin) {
    const APPDATA = process.env.APPDATA, LOCAL = process.env.LOCALAPPDATA, PD = process.env.ProgramData;
    const exts = ["cmd", "exe", "ps1", "bat", ""];
    const bases = [
      APPDATA && path.join(APPDATA, "npm"),
      LOCAL && path.join(LOCAL, "pnpm"),
      LOCAL && path.join(LOCAL, "Yarn", "bin"),
      LOCAL && path.join(LOCAL, "Microsoft", "WinGet", "Links"),
      LOCAL && path.join(LOCAL, "Programs", id),
      path.join(home, ".bun", "bin"),
      path.join(home, ".volta", "bin"),
      path.join(home, "scoop", "shims"),
      PD && path.join(PD, "chocolatey", "bin"),
      path.join(home, ".local", "bin"),
      path.join(home, "AppData", "Roaming", "npm"),
    ].filter(Boolean);
    const out = [];
    for (const base of bases) for (const ext of exts) out.push(path.join(base, ext ? `${id}.${ext}` : id));
    return out;
  }
  return [
    path.join(home, ".local", "bin", id),
    path.join(home, "bin", id),
    path.join(home, ".bun", "bin", id),
    path.join(home, ".volta", "bin", id),
    path.join(home, ".npm-global", "bin", id),
    path.join(home, ".yarn", "bin", id),
    path.join(home, ".local", "share", "pnpm", id),
    `/usr/local/bin/${id}`,
    `/opt/homebrew/bin/${id}`,
    `/usr/bin/${id}`,
    `/snap/bin/${id}`,
  ];
}

// Bilinen bir CLI komutu adapter alanindan daha guvenilir kaynaktir. Eski veya elle
// duzenlenmis config'te adapter=claude + cmd=codex gibi bir celiski varsa hedef CLI'nin
// guvenli varsayilan argumanlarina donulur; boylece bir CLI'ye digerinin bayragi gitmez.
function normalizeAgentAdapter(agent) {
  if (!agent || typeof agent !== "object") return false;
  const configured = String(agent.adapter || "").trim().toLowerCase();
  const inferred = adapterId(agent.cmd);
  const adapter = inferred !== "custom" ? inferred : (DEFINITIONS[configured] ? configured : "custom");
  let changed = false;
  if (inferred !== "custom" && configured && configured !== inferred) {
    agent.args = DEFINITIONS[inferred].defaultArgs.slice();
    delete agent.model;
    delete agent.modelOverride;
    changed = true;
  }
  if (agent.adapter !== adapter) {
    agent.adapter = adapter;
    changed = true;
  }
  return changed;
}

function normalizeAgentAdapters(cfg) {
  if (!cfg?.agents || typeof cfg.agents !== "object") return false;
  let changed = false;
  for (const agent of Object.values(cfg.agents)) if (normalizeAgentAdapter(agent)) changed = true;
  return changed;
}

// Ajan hapsi acik mi? cfg.sandbox.mode === "workspace" ise CLI'lar calisma klasoru DISINA
// yazamaz/aga cikamaz. cfg verilmeyen (test/edge) cagrilar hapissiz kalir; boylece mevcut
// arguman-esitlik testleri aynen gecer. Gercek calistirmada normalizeConfig mode'u daima
// doldurur (varsayilan "workspace").
function confineWorkspace(cfg) {
  return cfg?.sandbox?.mode === "workspace";
}
function sandboxWritableRoots(cfg) {
  const roots = cfg?.sandbox?.extraWritableDirs;
  return Array.isArray(roots) ? roots.filter((x) => typeof x === "string" && x.trim()).map(String) : [];
}

// cfg verilirse cfg.cliSettings[adapter] o CLI'nin varsayilan model ayari olarak uygulanir.
// Oncelik: agent.model (profil bazli) > cliSettings[adapter].model (global) > CLI varsayilani.
function effectiveAgent(agent, cfg) {
  const copy = { ...agent, args: Array.isArray(agent.args) ? agent.args.map(String) : [] };
  normalizeAgentAdapter(copy);
  const adapter = copy.adapter;
  const commandAdapter = adapterId(copy.cmd);
  const settings = (cfg && cfg.cliSettings && cfg.cliSettings[adapter]) || {};
  if (!copy.silenceTimeoutSeconds && DEFINITIONS[adapter]?.silenceTimeoutSeconds) copy.silenceTimeoutSeconds = DEFINITIONS[adapter].silenceTimeoutSeconds;
  if (commandAdapter === adapter && RESOLVED.has(adapter) && !path.isAbsolute(copy.cmd)) copy.cmd = RESOLVED.get(adapter);
  if (adapter === "codex") {
    const commands = new Set(["exec", "review", "resume", "apply"]);
    if (!copy.args.some((arg) => commands.has(arg))) copy.args.unshift("exec", "--skip-git-repo-check");
    else if (copy.args.includes("exec") && !copy.args.includes("--skip-git-repo-check")) copy.args.splice(copy.args.indexOf("exec") + 1, 0, "--skip-git-repo-check");
    // Hapis: calisma klasoru (spawn cwd = codex "workspace") disina yazma ve ag engellenir.
    // AYRICA: `codex exec` bayraksiz calistiginda read-only sandbox'a duser; yazma reddedilir
    // ama surec 0 doner, motor delegasyonu "tamamlandi" sayar ve hicbir dosya uretmeden turlar
    // yanar. Yani bu bayrak yalnizca hapis degil, otonom kosumun calismasi icin de sarttir.
    // Native sandbox — mac Seatbelt / Linux Landlock+seccomp / Windows restricted-token+ACL —
    // Docker/Git GEREKTIRMEZ. Kullanici acikca kendi -s/--sandbox veya bypass bayragini
    // koyduysa ona dokunmayiz. Bayrak, model/effort/tier PUSH'undan ONCE ve exec/skip-git'ten
    // HEMEN SONRA eklenir; testlerin args.slice(0,2) ve slice(-6) beklentileri korunur.
    const alreadySandboxed = copy.args.some((arg) => arg === "-s" || arg === "--sandbox" || arg === "--dangerously-bypass-approvals-and-sandbox" || arg === "--full-auto");
    if (confineWorkspace(cfg) && !alreadySandboxed) {
      const anchor = copy.args.indexOf("--skip-git-repo-check");
      const at = anchor >= 0 ? anchor + 1 : Math.max(copy.args.indexOf("exec") + 1, 0);
      const flags = ["-s", "workspace-write"];
      const roots = sandboxWritableRoots(cfg);
      if (roots.length) flags.push("-c", `sandbox_workspace_write.writable_roots=${JSON.stringify(roots)}`);
      copy.args.splice(at, 0, ...flags);
    }
    const model = String(copy.model || settings.model || "").trim();
    const effort = ["low", "medium", "high", "xhigh", "max", "ultra"].includes(String(settings.reasoningEffort)) ? String(settings.reasoningEffort) : "";
    const serviceTier = /^[A-Za-z0-9._-]{1,64}$/.test(String(settings.serviceTier || "")) ? String(settings.serviceTier) : "";
    if (model && !copy.args.includes("--model") && !copy.args.includes("-m")) copy.args.push("--model", model);
    if (effort && !copy.args.some((arg) => String(arg).startsWith("model_reasoning_effort="))) copy.args.push("-c", `model_reasoning_effort="${effort}"`);
    if (serviceTier && !copy.args.some((arg) => String(arg).startsWith("service_tier="))) copy.args.push("-c", `service_tier="${serviceTier}"`);
  }
  if (adapter === "claude") {
    if (!copy.args.includes("-p") && !copy.args.includes("--print")) copy.args.unshift("-p");
    // Cikti formatini DAIMA stream-json'a normalize et (eski config.json'lar 'text'/'json' tutuyor
    // olabilir). Boylece claude akitir ve sessizlik-timeout yanlis-pozitifi ortadan kalkar.
    const ofIdx = copy.args.indexOf("--output-format");
    if (ofIdx >= 0) copy.args[ofIdx + 1] = "stream-json";
    else copy.args.push("--output-format", "stream-json");
    // stream-json, -p (print) modunda --verbose ZORUNLU kilar; yoksa claude hata verir.
    if (!copy.args.includes("--verbose")) copy.args.push("--verbose");
  }
  if (adapter === "gemini") {
    // Otonom, non-interaktif calisma icin onay modu sart; yoksa izin bekleyip takilir.
    if (!copy.args.includes("--approval-mode") && !copy.args.includes("-y") && !copy.args.includes("--yolo")) copy.args.push("--approval-mode", "yolo");
    // Gemini "guvenilmeyen" klasorde yolo'yu SESSIZCE default'a dusurur ve onay bekler; otonom
    // kosumda onaylayan olmadigi icin sessizlik zaman asimina dusup karantinaya girer.
    // --skip-trust yalnizca o oturum icindir, kalici ayarlara dokunmaz.
    if (!copy.args.includes("--skip-trust") && cliSupportsFlag(copy.cmd, "--skip-trust")) copy.args.push("--skip-trust");
  }
  if (adapter === "opencode") {
    if (!copy.args.includes("run")) copy.args.unshift("run");
    // config.json'da eski otomatik profil kalmis olsa da uyumsuz bayragi temizle.
    copy.args = copy.args.filter((arg) => arg !== "--auto");
    const formatAt = copy.args.indexOf("--format");
    if (formatAt >= 0) copy.args.splice(formatAt, 2);
    copy.args.splice(copy.args.indexOf("run") + 1, 0, "--format", "json");
    const hasModel = copy.args.includes("--model") || copy.args.includes("-m");
    // Sira: agent modeli > global CLI ayari > otomatik secim (bkz. ensureOpenCodeModels).
    const model = copy.model || String(settings.model || "").trim()
      || selectOpenCodeModel(OPEN_CODE_MODELS.length ? OPEN_CODE_MODELS : ensureOpenCodeModels(copy.cmd), settings);
    if (!hasModel && model) copy.args.splice(copy.args.indexOf("run") + 3, 0, "--model", model);
    if (model) copy.model = model;
    if (!copy.args.includes("{PROMPT}") && !copy.args.includes("{PROMPT_FILE}")) {
      copy.args.push("Attached file contains the full task. Follow it exactly, make the changes, and report what you did.", "--file", "{PROMPT_FILE}");
    }
  }
  return copy;
}

// Bayrak destegi --help'ten okunur: kosulsuz eklemek eski surumlerde "unknown argument" ile her
// calistirmayi kirar.
//
// SENKRON SPAWN YALNIZCA KESIF SIRASINDA. effectiveAgent HTTP istek yolunda cagriliyor ve
// oradaki spawnSync event loop'u kilitleyip baglantiyi ECONNRESET ile dusuruyor (sunucu-akis
// testi bunu yakaladi); effectiveAgent yalnizca hazir sonucu okur, bilinmiyorsa bayrak eklenmez.
// Anahtar komuttur: ayni adapteri farkli binary/surumle kullanan agentler karismamali.
const FLAG_SUPPORT = new Map();
function flagSupportKey(command, flag) {
  return `${command} ${flag}`;
}
function probeFlagSupport(command, flags) {
  let help = "";
  try {
    const result = spawnSync(command, ["--help"], {
      encoding: "utf8", timeout: 15000, windowsHide: true,
      shell: isWin && (!path.isAbsolute(command) || /\.(cmd|bat)$/i.test(command)),
    });
    help = `${result.stdout || ""}\n${result.stderr || ""}`;
  } catch {}
  const supported = [];
  for (const flag of flags) {
    const ok = Boolean(help) && help.includes(flag);
    FLAG_SUPPORT.set(flagSupportKey(command, flag), ok);
    if (ok) supported.push(flag);
  }
  return supported;
}
// Desteklenmeyenler DE isaretlenir; yoksa "bilinmiyor" kalir ve sonraki probe (saglik testi
// sirasinda) yeniden yoklar — kacinmak istedigimiz spawnSync tam olarak budur.
function restoreFlagSupport(command, allFlags, supportedFlags) {
  const supported = new Set(supportedFlags || []);
  for (const flag of allFlags || []) FLAG_SUPPORT.set(flagSupportKey(command, flag), supported.has(flag));
}
function cliSupportsFlag(command, flag) {
  return FLAG_SUPPORT.get(flagSupportKey(command, flag)) === true;
}

function probeCommand(command, definition) {
  try {
    const result = spawnSync(command, definition.versionArgs, {
      encoding: "utf8",
      timeout: 12000,
      windowsHide: true,
      shell: isWin && (!path.isAbsolute(command) || /\.(cmd|bat)$/i.test(command)),
    });
    const output = String(result.stdout || result.stderr || "").trim().split(/\r?\n/)[0];
    return { installed: result.status === 0, version: result.status === 0 ? output : "", error: result.status === 0 ? "" : output, resolvedCommand: result.status === 0 ? command : "" };
  } catch (error) {
    return { installed: false, version: "", error: error.message, resolvedCommand: "" };
  }
}

function probe(id, definition, cfg) {
  let result = probeCommand(definition.command, definition);
  let installedPath = "";
  if (!result.installed) {
    for (const candidate of commonCandidates(id)) {
      if (!fs.existsSync(candidate)) continue;
      if (!installedPath) installedPath = candidate;
      result = probeCommand(candidate, definition);
      if (result.installed) break;
    }
    // Bazi CLI'lar (or. gemini) --version cagrisinda cmd.exe uzerinden yavas acildigi icin
    // zaman asimina ugrar. Ikili dosya diskte mevcutsa, versiyon okunamasa bile "kurulu" say;
    // aksi halde kurulu CLI yanlislikla devre disi birakiliyordu.
    if (!result.installed && installedPath) {
      result = { installed: true, version: "kurulu", error: "", resolvedCommand: installedPath };
    }
  }
  if (result.installed) RESOLVED.set(id, result.resolvedCommand);
  // Bilinen bayrak tekrar yoklanmaz: probe() saglik testinden de cagriliyor ve o sirada
  // sunucu istek servis ediyor olabilir (bkz. probeFlagSupport'taki ECONNRESET notu).
  if (result.installed && definition.optionalFlags?.length) {
    const command = result.resolvedCommand || definition.command;
    const unknown = definition.optionalFlags.filter((flag) => !FLAG_SUPPORT.has(flagSupportKey(command, flag)));
    if (unknown.length) probeFlagSupport(command, unknown);
    result.supportedFlags = definition.optionalFlags.filter((flag) => cliSupportsFlag(command, flag));
  }
  if (result.installed && id === "opencode") {
    const settings = (cfg && cfg.cliSettings && cfg.cliSettings.opencode) || {};
    OPEN_CODE_MODELS = listOpenCodeModels(result.resolvedCommand || definition.command);
    result.models = OPEN_CODE_MODELS.slice();
    result.recommendedModel = String(settings.model || "").trim() || selectOpenCodeModel(OPEN_CODE_MODELS, settings);
    result.ready = Boolean(result.recommendedModel);
    result.readinessError = result.ready ? "" : (OPEN_CODE_MODELS.length
      ? "Otomatik secim kurallarina uyan bir OpenCode modeli bulunamadi. Ayarlardan bir model secin veya cliSettings.opencode.modelPreferences desenlerini duzenleyin."
      : "OpenCode kurulu, ancak model listesi okunamadi. Once saglayici girisini tamamlayin.");
  }
  return result;
}

// Her acilista tum CLI'lar --version ile yoklaniyordu; olculen maliyet 4.8 saniye ve panel
// bu sure boyunca hic acilmiyordu. Onbellek YALNIZCA su kosulda kullanilir: CLI daha once
// KURULU bulunmus VE cozulmus ikili dosya HALA diskte duruyor. Bu durumda tekrar yoklamak
// zaten bilinen bir cevabi dogrulamaktan ibarettir.
//
// Bilerek onbelleklenmeyenler (dogruluk hizdan onceliklidir):
//   - Daha once "kurulu degil" bulunanlar  -> yeni kurulan CLI ilk acilista gorunur.
//   - Diskte bulunamayan cozulmus yol      -> kaldirilan CLI hemen fark edilir.
//   - opencode                             -> model listesi/ready durumu degisebilir;
//                                             her acilista tam yoklanir, davranisi aynen korunur.
// "Yeniden Tara" (/api/cli/discover) daima force ile cagirir ve onbellegi tumden atlar.
const DISCOVERY_CACHE_VERSION = 1;
const ALWAYS_PROBE = new Set(["opencode"]);

// probeCommand, CLI'yi PATH uzerinden buldugunda resolvedCommand'i CIPLAK AD olarak dondurur
// ("codex"), mutlak yol olarak degil. Duz fs.existsSync bu durumda daima false verir ve
// onbellek hic tutmaz. Bu yuzden ciplak adlar PATH (+ Windows'ta PATHEXT) uzerinde aranir:
// spawn maliyeti olmadan, birkac milisaniyede ve dogru sonucla.
function resolvesOnPath(command) {
  if (!command) return false;
  if (command.includes("/") || command.includes("\\")) return fs.existsSync(command);
  const dirs = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const exts = isWin ? String(process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      try { if (fs.existsSync(path.join(dir, command + ext))) return true; } catch {}
    }
  }
  return false;
}

function cachedProbeUsable(entry) {
  return Boolean(entry && entry.installed && entry.resolvedCommand && resolvesOnPath(entry.resolvedCommand));
}

// OpenCode model listesi persist EDILMEZ; her acilista `opencode models` ile bellekten
// uretilir. O cagri acilista gecici olarak yavas/basarisiz olursa (soguk ilk cagri, auth
// oturmamis, ag) liste bos kalir ve panel model dropdown'i o process boyunca bos gorunur.
// codex icin codexModelCache ile cozulen bu kirilganligi opencode icin de kapatiriz: prob
// bos donerse son basarili liste (config'te saklanan) fallback olarak kullanilir. Fallback
// ayni zamanda OPEN_CODE_MODELS'i doldurur ki otomatik model secimi de calissin.
// settings: fallback yolunda da kullanicinin acik modeli / modelPreferences desenleri gecerli
// olmali; aksi halde bayat listeden varsayilan kurallarla secim yapilirdi.
function applyOpenCodeFallback(entry, fallback, settings = {}) {
  if (!entry || entry.id !== "opencode" || !entry.installed) return entry;
  if ((entry.models && entry.models.length) || !Array.isArray(fallback) || !fallback.length) return entry;
  const models = fallback.map(String).filter(Boolean);
  if (!models.length) return entry;
  OPEN_CODE_MODELS = models.slice();
  entry.models = models.slice();
  entry.recommendedModel = String(settings.model || "").trim() || selectOpenCodeModel(models, settings);
  entry.ready = Boolean(entry.recommendedModel);
  entry.modelsFromCache = true;
  if (entry.ready) entry.readinessError = "";
  return entry;
}

function discoverInstalled(options = {}) {
  const cache = options.cache?.version === DISCOVERY_CACHE_VERSION ? options.cache.results || {} : {};
  const force = options.force === true;
  const openCodeFallback = Array.isArray(options.openCodeModels) ? options.openCodeModels : [];
  return Object.entries(DEFINITIONS).map(([id, definition]) => {
    const cached = cache[id];
    if (!force && !ALWAYS_PROBE.has(id) && cachedProbeUsable(cached)) {
      RESOLVED.set(id, cached.resolvedCommand);
      // Eski sema onbelleginde supportedFlags yok. Yoklama burada, HTTP dinleme baslamadan yapilir.
      let supportedFlags = cached.supportedFlags;
      if (!Array.isArray(supportedFlags) && definition.optionalFlags?.length) {
        supportedFlags = probeFlagSupport(cached.resolvedCommand, definition.optionalFlags);
      } else {
        restoreFlagSupport(cached.resolvedCommand, definition.optionalFlags, supportedFlags);
      }
      return { id, ...definition, installed: true, version: cached.version || "kurulu", error: "", resolvedCommand: cached.resolvedCommand, fromCache: true, supportedFlags: supportedFlags || [] };
    }
    // cfg: model onerisi kullanicinin modelPreferences desenlerine gore uretilir.
    // fallback: prob bos donerse son bilinen model listesi korunur.
    const result = { id, ...definition, ...probe(id, definition, options.cfg) };
    return id === "opencode"
      ? applyOpenCodeFallback(result, openCodeFallback, (options.cfg && options.cfg.cliSettings && options.cfg.cliSettings.opencode) || {})
      : result;
  });
}

// Bir sonraki acilista kullanilacak onbellek gorununu uretir. Yalnizca kurulu ve yolu
// cozulmus girdiler saklanir; digerleri zaten her acilista yeniden yoklanir.
function discoveryCacheFrom(discovered) {
  const results = {};
  for (const cli of discovered || []) {
    if (cli.installed && cli.resolvedCommand && !ALWAYS_PROBE.has(cli.id)) {
      // supportedFlags saklanmazsa onbellekli acilista Gemini --skip-trust sessizce duserdi.
      results[cli.id] = { installed: true, version: cli.version || "kurulu", resolvedCommand: cli.resolvedCommand, supportedFlags: cli.supportedFlags || [] };
    }
  }
  return { version: DISCOVERY_CACHE_VERSION, checkedAt: new Date().toISOString(), results };
}

// Tek kaynak: hem gercek gorev calistirici (engine.runCli) hem saglik testi ve model
// listeleme ayni komut kurulumunu kullanir. Bare npm CLI adlarini where.exe ile fiziksel
// yola cevirmiyoruz; cmd.exe PATHEXT/PATH cozumlemesini Unicode olarak kendisi yapar.
function buildCommand(command, args) {
  if (!isWin) return { file: command, args, shell: false };
  const bare = !path.isAbsolute(command) && !/[\\/]/.test(command);
  if (bare) {
    // shell:true iken Node argumanlari birlestirip cmd.exe'ye verir ve OTOMATIK TIRNAK KOYMAZ.
    // Bosluk iceren yol argumanlari (or. "C:\Users\John Doe\...\x.settings.json" veya
    // {PROMPT_FILE}) ikiye bolunurdu; bu da --settings/--file yolunu bozardi. Bosluk veya
    // kabuk metakarakteri iceren argumanlari tirnakla; sade bayrak/model adlari dokunulmaz.
    const shellQuote = (value) => {
      const v = String(value);
      return /[\s"^&|<>()%!]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
    };
    return { file: command, args: args.map(shellQuote), shell: true };
  }
  if (!/\.(cmd|bat)$/i.test(command)) return { file: command, args, shell: false };
  const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
  return { file: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", `"${[command, ...args].map(quote).join(" ")}"`], shell: false, verbatim: true };
}

function healthPrompt(id) {
  return [
    "CLI_TEAM_HEALTH_CHECK",
    `Bu ${id} cli aracinin kullanilabilirlik testidir.`,
    "Yalnizca HEALTH_OK yaz.",
    "Dosya olusturma, degistirme, silme, komut calistirma veya dis sisteme istek gonderme.",
  ].join("\n");
}

// Normal gorev calistiricisi {PROMPT}/{PROMPT_FILE} yer tutucularini cagridan once
// doldurur. Health check de ayni sozlesmeyi kullanmali; aksi halde OpenCode literal
// `{PROMPT_FILE}` yolunu acmaya calisir ve saglikli agent katalogdan yanlislikla elenir.
function preparePromptArgs(args, prompt) {
  let tempDir = "", promptFile = "", useStdin = true;
  const prepared = (Array.isArray(args) ? args : []).map((arg) => {
    const value = String(arg);
    if (value.includes("{PROMPT}")) {
      useStdin = false;
      return value.replaceAll("{PROMPT}", prompt);
    }
    if (value.includes("{PROMPT_FILE}")) {
      useStdin = false;
      if (!promptFile) {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-team-health-"));
        promptFile = path.join(tempDir, "prompt.md");
        fs.writeFileSync(promptFile, prompt, "utf8");
      }
      return value.replaceAll("{PROMPT_FILE}", promptFile);
    }
    return value;
  });
  return {
    args: prepared,
    useStdin,
    promptFile,
    cleanup() { if (tempDir) { try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} } },
  };
}

// Tek kaynak: OpenCode icin otonom izinler surumden bagimsiz olarak OPENCODE_CONFIG_CONTENT
// ile aktarilir. Hem engine.runCli hem saglik testi bu ortami kullanir ki test ile gercek
// calistirma ayni izinlerle calissin.
function agentEnvironment(agent) {
  const env = { ...process.env };
  if (agent.adapter !== "opencode") return env;
  let inline = {};
  try { inline = JSON.parse(env.OPENCODE_CONFIG_CONTENT || "{}"); } catch {}
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ ...inline, permission: { "*": "allow" } });
  return env;
}

function classifyHealthFailure(text) {
  const raw = String(text || "");
  if (/requires a newer version|upgrade to the latest|version.*unsupported|unsupported.*version|model metadata.*not found|unsupported.*model/i.test(raw)) return { status: "version-incompatible", label: "Sürüm uyumsuz", detail: raw };
  if (/api key|unauthorized|unauthenticated|authentication|login required|not logged in|sign in|giriÅŸ gerekli/i.test(raw)) return { status: "auth-required", label: "Giriş gerekli", detail: raw };
  if (/rate.?limit|quota|too many requests|billing|credit/i.test(raw)) return { status: "quota", label: "Kota veya ödeme gerekli", detail: raw };
  if (/timeout|timed out|zaman aÅŸÄ±m/i.test(raw)) return { status: "timeout", label: "Yanıt zaman aşımına uğradı", detail: raw };
  return { status: "failed", label: "Test başarısız", detail: raw };
}

function testInstalledCli(id, options = {}) {
  const definition = DEFINITIONS[id];
  if (!definition) return Promise.resolve({ id, installed: false, health: { status: "unknown", label: "Bilinmiyor", detail: "Tanımsız CLI" } });
  const found = probe(id, definition, options.cfg);
  if (!found.installed) return Promise.resolve({ id, installed: false, version: found.version, error: found.error, health: { status: "not-installed", label: "Kurulu değil", detail: found.error || "CLI bulunamadı" } });
  const agent = effectiveAgent({ adapter: id, cmd: definition.command, args: definition.defaultArgs.slice() }, options.cfg);
  const prompt = healthPrompt(id);
  const prepared = preparePromptArgs(agent.args, prompt);
  const command = buildCommand(agent.cmd, prepared.args);
  const timeoutMs = Math.max(10000, Number(options.timeoutMs || 45000));
  return new Promise((resolve) => {
    let stdout = "", stderr = "", settled = false;
    let child;
    try {
      child = spawn(command.file, command.args, { env: agentEnvironment(agent), shell: command.shell, windowsHide: true, windowsVerbatimArguments: !!command.verbatim });
    } catch (error) {
      prepared.cleanup();
      return resolve({ id, installed: true, version: found.version, health: classifyHealthFailure(error.message) });
    }
    const unregister = registerProbe(child);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unregister();
      terminateProbeTree(child);
      prepared.cleanup();
      resolve({ id, installed: true, version: found.version, health: { status: "timeout", label: "Yanıt zaman aşımına uğradı", detail: `Sağlık testi ${Math.round(timeoutMs / 1000)} saniyede tamamlanmadı.` } });
    }, timeoutMs);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (data) => { stdout += String(data); });
    child.stderr?.on("data", (data) => { stderr += String(data); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unregister();
      prepared.cleanup();
      const failure = classifyHealthFailure(error.message);
      resolve({ id, installed: true, version: found.version, health: failure });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unregister();
      prepared.cleanup();
      const raw = `${stdout}\n${stderr}`.trim();
      if (code === 0 && /HEALTH_OK/i.test(raw)) resolve({ id, installed: true, version: found.version, health: { status: "ready", label: "Hazır", detail: "Gerçek sağlık testi başarılı." } });
      else resolve({ id, installed: true, version: found.version, health: classifyHealthFailure(raw || `Çıkış kodu ${code}`) });
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(prepared.useStdin ? prompt : "");
  });
}

async function healthCheckAll(discovered = discoverInstalled(), options = {}) {
  const results = await Promise.all(discovered.map((item) => testInstalledCli(item.id, options)));
  return discovered.map((item) => ({ ...item, ...(results.find((result) => result.id === item.id) || {}) }));
}

function listCodexModels(options = {}) {
  const command = buildCommand("codex", ["app-server", "--listen", "stdio://"]);
  const timeoutMs = Math.max(5000, Number(options.timeoutMs || 20000));
  return new Promise((resolve, reject) => {
    let buffer = "", settled = false, modelRequestSent = false;
    let child, unregister = () => {};
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unregister();
      terminateProbeTree(child);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error(`Codex model listesi ${Math.round(timeoutMs / 1000)} saniyede alınamadı.`)), timeoutMs);
    try { child = spawn(command.file, command.args, { shell: command.shell, windowsHide: true, windowsVerbatimArguments: !!command.verbatim }); }
    catch (error) { finish(error); return; }
    unregister = registerProbe(child);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1 && !modelRequestSent) {
          modelRequestSent = true;
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "model/list", params: { includeHidden: false, limit: 200 } })}\n`);
        } else if (message.id === 2) {
          if (message.error) { finish(new Error(message.error.message || "Codex model listesi alınamadı.")); return; }
          const models = Array.isArray(message.result?.data) ? message.result.data : [];
          finish(null, models.filter((model) => model && model.hidden !== true).map((model) => ({
            id: String(model.id || model.model || ""),
            model: String(model.model || model.id || ""),
            displayName: String(model.displayName || model.id || model.model || ""),
            description: String(model.description || ""),
            defaultReasoningEffort: String(model.defaultReasoningEffort || "medium"),
            reasoningEfforts: (model.supportedReasoningEfforts || []).map((item) => ({
              id: String(item.reasoningEffort || item.id || ""),
              description: String(item.description || ""),
            })).filter((item) => item.id),
            serviceTiers: (model.serviceTiers || []).map((item) => ({
              id: String(item.id || ""),
              name: String(item.name || item.id || ""),
              description: String(item.description || ""),
            })).filter((item) => item.id),
            additionalSpeedTiers: Array.isArray(model.additionalSpeedTiers) ? model.additionalSpeedTiers.map(String) : [],
            defaultServiceTier: model.defaultServiceTier ? String(model.defaultServiceTier) : "",
            isDefault: model.isDefault === true,
          })).filter((model) => model.id));
        }
      }
    });
    child.stderr?.on("data", () => {});
    child.on("error", finish);
    child.stdin?.on("error", () => {});
    child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "crewctl", version: "1.0.0", title: "CrewCtl" } } })}\n`);
  });
}

function addMissingAgents(cfg, discovered) {
  cfg.agents ||= {};
  const ignored = new Set(Array.isArray(cfg.discoveryIgnoredAdapters) ? cfg.discoveryIgnoredAdapters.map(String) : []);
  let changed = normalizeAgentAdapters(cfg);
  for (const cli of discovered) {
    const usable = cli.installed && (cli.id !== "opencode" || cli.ready !== false || Boolean(cfg.cliSettings?.opencode?.model));
    const matchingEntries = Object.entries(cfg.agents).filter(([, agent]) => (agent.adapter || adapterId(agent.cmd)) === cli.id);
    const existingEntry = matchingEntries.find(([, agent]) => !agent.autoDiscovered) || matchingEntries[0];
    const existing = existingEntry?.[1];
    // Kullanici otomatik bulunan bir profili sildiyse bu karar kalicidir. O adapter'a ait
    // elle olusturulmus profil varsa ona dokunma; yalnizca autoDiscovered kaydini temizle.
    if (ignored.has(cli.id)) {
      for (const [name, agent] of matchingEntries) {
        if (!agent.autoDiscovered) continue;
        delete cfg.agents[name];
        changed = true;
      }
      continue;
    }
    if (existing) {
      if (usable && existing.autoDiscovered && existing.unavailablePlaceholder) {
        existing.enabled = true;
        existing.args = cli.defaultArgs.slice();
        delete existing.unavailablePlaceholder;
        changed = true;
      }
      // Eski surumler otomatik oneriyi agent.model alanina yaziyordu. Bu alan global
      // CLI ayarini ezdigi icin, kullanici tarafindan acikca override olarak isaretlenmemis
      // otomatik profiller modeli daima CLI ayarindan/otomatik secimden miras alir.
      if (cli.id === "opencode" && existing.autoDiscovered && existing.model && existing.modelOverride !== true) {
        delete existing.model;
        changed = true;
      }
      if (cli.installed && cli.id === "opencode" && existing.autoDiscovered && Number(existing.timeoutSeconds || 0) < cli.timeoutSeconds) {
        existing.timeoutSeconds = cli.timeoutSeconds;
        changed = true;
      }
      if (!usable && existing.autoDiscovered && existing.enabled !== false) {
        existing.enabled = false;
        existing.unavailablePlaceholder = true;
        changed = true;
      }
      continue;
    }
    // OpenCode adapteri her cihazda katalogda gorunur. Kurulu degilse guvenli
    // sekilde devre disi placeholder olur; taramada bulundugunda otomatik etkinlesir.
    if (!cli.installed && cli.id !== "opencode") continue;
    let name = `${cli.id}-auto`, suffix = 2;
    while (cfg.agents[name]) name = `${cli.id}-auto-${suffix++}`;
    cfg.agents[name] = {
      adapter: cli.id,
      cmd: cli.command,
      args: cli.defaultArgs.slice(),
      enabled: usable,
      description: cli.description,
      capabilities: cli.capabilities.slice(),
      roleFile: cli.roleFile,
      costTier: "standard",
      timeoutSeconds: cli.timeoutSeconds || 1200,
      ...(cli.silenceTimeoutSeconds ? { silenceTimeoutSeconds: cli.silenceTimeoutSeconds } : {}),
      autoDiscovered: true,
      ...(!usable ? { unavailablePlaceholder: true } : {}),
    };
    changed = true;
  }
  return changed;
}

// Operator, uzman agent'lardan BAGIMSIZ bir CLI secimidir (claude/codex/gemini/opencode).
// operator.md rolunu bu CLI giyer; uzman agent'lar operatorun ALTINDA delege edilir.
// Bir uzman agent silinse bile operator etkilenmez.
function operatorSpec(cli, cfg) {
  const op = (cfg && cfg.operator) || {};
  const definition = DEFINITIONS[cli];
  // Standart CLI'lar DEFINITIONS'tan cozulur. cfg.operator.cmd verilirse (ozel/test operatoru)
  // dogrudan o komut kullanilir; boylece operator, uzman agent'lardan tamamen bagimsiz kalir.
  const cmd = op.cmd || (definition && definition.command);
  if (!cmd) return null;
  const args = op.cmd ? (Array.isArray(op.args) ? op.args.slice() : []) : (definition ? definition.defaultArgs.slice() : []);
  // Model/effort/tier secimi CLI bazlidir (cfg.cliSettings) ve effectiveAgent icinde uygulanir;
  // ayni ayar o CLI'yi kullanan operator ve tum uzman agent'lar icin gecerlidir.
  const timeoutSeconds = op.timeoutSeconds || (cfg && cfg.agentTimeoutSeconds) || 900;
  const silenceTimeoutSeconds = op.silenceTimeoutSeconds || (definition && definition.silenceTimeoutSeconds) || (cfg && cfg.cliSilenceTimeoutSeconds) || 300;
  const adapter = definition ? cli : (op.adapter || adapterId(cmd));
  return effectiveAgent({ adapter, cmd, args, timeoutSeconds, silenceTimeoutSeconds }, cfg);
}

// Operator gecerli, kurulu bir CLI olmali. Eski semada operator.agent (uzman agent adi)
// tutuluyordu; burada operator.cli'ye tasinir. Kurulu degilse ilk kurulu CLI'ye gecilir.
function ensureValidOperator(cfg, discovered) {
  cfg.operator ||= {};
  let changed = false;
  if (cfg.operator.roleFile !== "roles/operator.md") { cfg.operator.roleFile = "roles/operator.md"; changed = true; }
  if (!cfg.operator.cli) {
    const legacy = cfg.operator.agent;
    const source = legacy && cfg.agents?.[legacy] ? cfg.agents[legacy].cmd : legacy;
    cfg.operator.cli = adapterId(source || "codex");
    changed = true;
  }
  if ("agent" in cfg.operator) { delete cfg.operator.agent; changed = true; }
  const installed = Array.isArray(discovered) ? discovered
    .filter((x) => x.installed && (x.id !== "opencode" || x.ready !== false || Boolean(cfg.cliSettings?.opencode?.model)))
    .map((x) => x.id) : null;
  const known = !!DEFINITIONS[cfg.operator.cli];
  const availableOnHost = !installed || installed.length === 0 || installed.includes(cfg.operator.cli);
  if (!known || !availableOnHost) {
    const fallback = (installed && installed[0]) || Object.keys(DEFINITIONS)[0];
    if (fallback && fallback !== cfg.operator.cli) { cfg.operator.cli = fallback; changed = true; }
  }
  return changed;
}

module.exports = { DEFINITIONS, KNOWN_CLIS: Object.keys(DEFINITIONS), adapterId, authHint, normalizeAgentAdapter, normalizeAgentAdapters, effectiveAgent, preparePromptArgs, operatorSpec, buildCommand, agentEnvironment, discoverInstalled, discoveryCacheFrom, applyOpenCodeFallback, healthCheckAll, listCodexModels, abortActiveProbes, currentProbeGeneration, selectOpenCodeModel, parseOpenCodeModels, addMissingAgents, ensureValidOperator };
