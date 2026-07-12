const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const isWin = process.platform === "win32";

const DEFINITIONS = {
  codex: {
    command: "codex",
    versionArgs: ["--version"],
    defaultArgs: ["exec", "--skip-git-repo-check"],
    description: "OpenAI Codex kodlama, hata ayiklama ve inceleme agenti",
    capabilities: ["implementation", "debugging", "testing", "review", "analysis"],
    roleFile: "roles/executor.md",
  },
  claude: {
    command: "claude",
    versionArgs: ["--version"],
    defaultArgs: ["-p", "--permission-mode", "acceptEdits", "--output-format", "text"],
    description: "Claude Code uygulama, analiz ve test agenti",
    capabilities: ["implementation", "debugging", "testing", "review", "web"],
    roleFile: "roles/executor.md",
  },
  gemini: {
    command: "gemini",
    versionArgs: ["--version"],
    // Argumansiz gemini interaktif TUI acar ve izin bekler; yolo ile otonom, stdin'den prompt alir.
    defaultArgs: ["--approval-mode", "yolo"],
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
    // --auto olmadan opencode run izinleri onaylamaz ve dosya degisikligi yapmaz.
    defaultArgs: ["run", "--auto", "Attached file contains the full task. Follow it exactly, make the changes, and report what you did.", "--file", "{PROMPT_FILE}"],
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

function effectiveAgent(agent) {
  const copy = { ...agent, args: Array.isArray(agent.args) ? agent.args.map(String) : [] };
  const adapter = agent.adapter || adapterId(agent.cmd);
  copy.adapter = adapter;
  if (adapter !== "custom" && RESOLVED.has(adapter) && !path.isAbsolute(copy.cmd)) copy.cmd = RESOLVED.get(adapter);
  if (adapter === "codex") {
    const commands = new Set(["exec", "review", "resume", "apply"]);
    if (!copy.args.some((arg) => commands.has(arg))) copy.args.unshift("exec", "--skip-git-repo-check");
    else if (copy.args.includes("exec") && !copy.args.includes("--skip-git-repo-check")) copy.args.splice(copy.args.indexOf("exec") + 1, 0, "--skip-git-repo-check");
  }
  if (adapter === "claude") {
    if (!copy.args.includes("-p") && !copy.args.includes("--print")) copy.args.unshift("-p");
    if (!copy.args.includes("--output-format")) copy.args.push("--output-format", "text");
  }
  if (adapter === "gemini") {
    // Otonom, non-interaktif calisma icin onay modu sart; yoksa izin bekleyip takilir.
    if (!copy.args.includes("--approval-mode") && !copy.args.includes("-y") && !copy.args.includes("--yolo")) copy.args.push("--approval-mode", "yolo");
  }
  if (adapter === "opencode") {
    if (!copy.args.includes("run")) copy.args.unshift("run");
    if (!copy.args.includes("--auto")) copy.args.splice(copy.args.indexOf("run") + 1, 0, "--auto");
    if (!copy.args.includes("{PROMPT}") && !copy.args.includes("{PROMPT_FILE}")) {
      copy.args.push("Attached file contains the full task. Follow it exactly, make the changes, and report what you did.", "--file", "{PROMPT_FILE}");
    }
  }
  return copy;
}

function probeCommand(command, definition) {
  try {
    const result = spawnSync(command, definition.versionArgs, {
      encoding: "utf8",
      timeout: 12000,
      windowsHide: true,
      shell: isWin && !path.isAbsolute(command),
    });
    const output = String(result.stdout || result.stderr || "").trim().split(/\r?\n/)[0];
    return { installed: result.status === 0, version: result.status === 0 ? output : "", error: result.status === 0 ? "" : output, resolvedCommand: result.status === 0 ? command : "" };
  } catch (error) {
    return { installed: false, version: "", error: error.message, resolvedCommand: "" };
  }
}

function probe(id, definition) {
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
  return result;
}

function discoverInstalled() {
  return Object.entries(DEFINITIONS).map(([id, definition]) => ({ id, ...definition, ...probe(id, definition) }));
}

function addMissingAgents(cfg, discovered) {
  cfg.agents ||= {};
  let changed = false;
  for (const cli of discovered) {
    const existing = Object.values(cfg.agents).find((agent) => (agent.adapter || adapterId(agent.cmd)) === cli.id);
    if (existing) {
      if (cli.installed && existing.autoDiscovered && existing.unavailablePlaceholder) {
        existing.enabled = true;
        existing.args = cli.defaultArgs.slice();
        delete existing.unavailablePlaceholder;
        changed = true;
      }
      if (cli.installed && cli.id === "opencode" && existing.autoDiscovered && Number(existing.timeoutSeconds || 0) < cli.timeoutSeconds) {
        existing.timeoutSeconds = cli.timeoutSeconds;
        changed = true;
      }
      if (!cli.installed && existing.autoDiscovered && existing.enabled !== false) {
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
      enabled: cli.installed,
      description: cli.description,
      capabilities: cli.capabilities.slice(),
      roleFile: cli.roleFile,
      costTier: "standard",
      timeoutSeconds: cli.timeoutSeconds || 1200,
      autoDiscovered: true,
      ...(!cli.installed ? { unavailablePlaceholder: true } : {}),
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
  const timeoutSeconds = op.timeoutSeconds || (cfg && cfg.agentTimeoutSeconds) || 900;
  const adapter = definition ? cli : (op.adapter || adapterId(cmd));
  return effectiveAgent({ adapter, cmd, args, timeoutSeconds });
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
  const installed = Array.isArray(discovered) ? discovered.filter((x) => x.installed).map((x) => x.id) : null;
  const known = !!DEFINITIONS[cfg.operator.cli];
  const availableOnHost = !installed || installed.length === 0 || installed.includes(cfg.operator.cli);
  if (!known || !availableOnHost) {
    const fallback = (installed && installed[0]) || Object.keys(DEFINITIONS)[0];
    if (fallback && fallback !== cfg.operator.cli) { cfg.operator.cli = fallback; changed = true; }
  }
  return changed;
}

module.exports = { DEFINITIONS, KNOWN_CLIS: Object.keys(DEFINITIONS), adapterId, effectiveAgent, operatorSpec, discoverInstalled, addMissingAgents, ensureValidOperator };
