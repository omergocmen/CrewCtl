const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const store = require("./store");
const cliRegistry = require("./cli-registry");

const isWin = process.platform === "win32";

function snapshotDir(dir) {
  const map = new Map();
  const ignored = (rel) => {
    const r = rel.replace(/\\/g, "/");
    return r.includes("node_modules") || r.includes(".git/") || r.startsWith(".git") ||
      r.startsWith("orchestrator/queue") || r.startsWith("orchestrator/state") ||
      r.startsWith("orchestrator/memory") || r.startsWith("orchestrator/node_modules");
  };
  let count = 0;
  const walk = (abs, rel) => {
    if (count > 12000) return;
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (ignored(childRel)) continue;
      const childAbs = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(childAbs, childRel);
      else {
        try {
          const s = fs.statSync(childAbs);
          map.set(childRel, `${s.mtimeMs}:${s.size}`);
          count++;
        } catch {}
      }
    }
  };
  walk(dir, "");
  return map;
}

function diffSnapshots(before, after) {
  const created = [], modified = [], deleted = [];
  for (const [file, stamp] of after) {
    if (!before.has(file)) created.push(file);
    else if (before.get(file) !== stamp) modified.push(file);
  }
  for (const file of before.keys()) if (!after.has(file)) deleted.push(file);
  return { created: created.sort(), modified: modified.sort(), deleted: deleted.sort() };
}

function clip(value, limit = 12000) {
  const text = String(value || "");
  return text.length <= limit ? text : `${text.slice(0, limit)}\n...[kesildi]`;
}

function classifyCliError(error) {
  const raw = String(error?.message || error || "Bilinmeyen CLI hatasi");
  if (/API key not valid|API_KEY_INVALID/i.test(raw)) {
    return { code: "AUTH_INVALID", summary: "API anahtari gecersiz veya kullanilamiyor.", action: "Bu agentin kimlik bilgilerini duzeltin ya da baska bir agent kullanin.", raw: clip(raw, 5000) };
  }
  if (/unauthorized|unauthenticated|authentication|login required|not logged in/i.test(raw)) {
    return { code: "AUTH_REQUIRED", summary: "CLI oturumu veya kimlik dogrulamasi gerekli.", action: "CLI'yi terminalde oturum acarak dogrulayin.", raw: clip(raw, 5000) };
  }
  if (/rate.?limit|too many requests|quota/i.test(raw)) {
    return { code: "RATE_LIMIT", summary: "Saglayici kota veya hiz sinirina takildi.", action: "Daha sonra deneyin veya alternatif agent kullanin.", raw: clip(raw, 5000) };
  }
  if (/not recognized as an internal|ENOENT|not found/i.test(raw)) {
    return { code: "CLI_NOT_FOUND", summary: "CLI komutu bulunamadi veya baslatilamadi.", action: "Agent komutunu ve PATH ayarini kontrol edin.", raw: clip(raw, 5000) };
  }
  if (/timeout|timed out|zaman asim|zaman aşım/i.test(raw)) {
    return { code: "TIMEOUT", summary: "CLI zaman asimina ugradi.", action: "Timeout degerini artirin veya gorevi daha kucuk parcalara bolun.", raw: clip(raw, 5000) };
  }
  return { code: "CLI_FAILED", summary: clip(raw.split(/\r?\n/)[0], 500), action: "Teknik ayrintiyi inceleyin veya alternatif agent kullanin.", raw: clip(raw, 5000) };
}

const RECOVERABLE_CLI_ERRORS = new Set(["AUTH_INVALID", "AUTH_REQUIRED", "RATE_LIMIT", "CLI_NOT_FOUND", "TIMEOUT", "CLI_FAILED"]);
const QUARANTINE_CLI_ERRORS = new Set(["AUTH_INVALID", "AUTH_REQUIRED", "CLI_NOT_FOUND"]);

function resolveExecutionMode(task) {
  if (["fast", "balanced", "deep"].includes(task.executionMode)) return task.executionMode;
  const prompt = String(task.prompt || "");
  const complex = /(mimari|migration|refactor|guvenlik|güvenlik|deploy|production|veritabani|veritabanı|authentication|entegrasyon|çoklu|multi|kapsamli|kapsamlı)/i.test(prompt);
  // Not: "oyun/sayfa" gibi sifirdan build isleri BASIT sayilmaz — bunlar plan+uygula+incele
  // gerektiren gercek gorevlerdir; fast moda dusurulup ekip kullanilmadan gecilmemeli.
  const simple = prompt.length < 350 && /(basit|ufak|küçük|kucuk|hizli|hızlı|simple|small|quick|dosya)/i.test(prompt);
  return simple && !complex ? "fast" : "balanced";
}

function applyExecutionPolicy(base, mode) {
  const cfg = { ...base, operator: { ...(base.operator || {}) } };
  if (mode === "fast") {
    cfg.operator.maxRounds = Math.min(cfg.operator.maxRounds || 6, 2);
    cfg.operator.maxDelegationsPerRound = 1;
    cfg.memoryCharBudget = Math.min(cfg.memoryCharBudget || 8000, 2500);
    cfg.teamContextCharBudget = Math.min(cfg.teamContextCharBudget || 30000, 10000);
  } else if (mode === "balanced") {
    cfg.operator.maxRounds = Math.min(cfg.operator.maxRounds || 6, 4);
    cfg.operator.maxDelegationsPerRound = Math.min(cfg.operator.maxDelegationsPerRound || 8, 3);
    cfg.memoryCharBudget = Math.min(cfg.memoryCharBudget || 8000, 6000);
    cfg.teamContextCharBudget = Math.min(cfg.teamContextCharBudget || 30000, 24000);
  }
  return cfg;
}

function windowsCommand(command, args) {
  if (!isWin) return { file: command, args, shell: false };
  const isBare = !path.isAbsolute(command) && !/[\\/]/.test(command);
  // Bare npm CLI adlarini `where.exe` ile fiziksel yola cevirmiyoruz. where.exe
  // OEM code-page ile cikti verebildigi icin Unicode kullanici dizinleri (Ömer gibi)
  // bozulabiliyor. cmd.exe, PATHEXT/PATH cozumlemesini Unicode olarak kendisi yapar.
  if (isBare) return { file: command, args, shell: true };
  if (!/\.(cmd|bat)$/i.test(command)) return { file: command, args, shell: false };
  const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const line = [command, ...args].map(quote).join(" ");
  return { file: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", `"${line}"`], shell: false, verbatim: true };
}

function parseJson(text, label) {
  const candidates = [];
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1]);
  candidates.push(String(text).trim());
  const first = String(text).indexOf("{");
  const last = String(text).lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(String(text).slice(first, last + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch {}
  }
  throw new Error(`${label} gecerli JSON dondurmedi.`);
}

function capabilitiesFor(agent) {
  const caps = new Set(Array.isArray(agent.capabilities) ? agent.capabilities.map((x) => String(x).toLowerCase()) : []);
  const role = String(agent.roleFile || "").toLowerCase();
  if (role.includes("executor")) caps.add("implementation");
  if (role.includes("review")) { caps.add("review"); caps.add("testing"); }
  if (role.includes("planner")) caps.add("planning");
  if (role.includes("operator")) { caps.add("planning"); caps.add("delegation"); }
  return caps;
}

function inferAssignmentKind(raw, instruction) {
  const explicit = String(raw.kind || "").toLowerCase();
  if (["implement", "review", "research", "plan"].includes(explicit)) return explicit;
  if (/\b(olustur|oluştur|yaz|uygula|kur|gelistir|geliştir|duzelt|düzelt|implement|build|create|edit|fix)\b/i.test(instruction)) return "implement";
  if (/\b(incele|denetle|dogrula|doğrula|review|audit|verify|test et)\b/i.test(instruction)) return "review";
  if (/\b(arastir|araştır|research|web)\b/i.test(instruction)) return "research";
  if (/\b(planla|plan|tasarla|design)\b/i.test(instruction)) return "plan";
  return "implement";
}

function supportsKind(agent, kind) {
  const caps = capabilitiesFor(agent);
  const wanted = {
    implement: ["implementation", "coding", "development", "debugging"],
    review: ["review", "testing", "security", "analysis"],
    research: ["research", "web", "analysis"],
    plan: ["planning", "analysis", "architecture"],
  }[kind] || [];
  return wanted.some((cap) => caps.has(cap));
}

function normalizeAssignments(value, cfg, operatorName, usedIds) {
  if (!Array.isArray(value)) throw new Error("Operator assignments dizisi dondurmedi.");
  const max = Math.max(1, cfg.operator?.maxDelegationsPerRound || 8);
  return value.slice(0, max).map((raw, index) => {
    const id = String(raw.id || `task-${Date.now()}-${index + 1}`).replace(/[^a-zA-Z0-9_.-]/g, "-");
    if (usedIds.has(id)) throw new Error(`Tekrarlanan delegasyon kimligi: ${id}`);
    usedIds.add(id);
    const requestedAgent = String(raw.agent || "");
    if (!cfg.agents[requestedAgent]) throw new Error(`Operator tanimsiz agent secti: ${requestedAgent}`);
    if (cfg.agents[requestedAgent].enabled === false) throw new Error(`Operator devre disi agent secti: ${requestedAgent}`);
    if (requestedAgent === operatorName) throw new Error("Operator kendisine uzman gorevi atayamaz.");
    const instruction = String(raw.instruction || raw.task || "").trim();
    if (!instruction) throw new Error(`${id} delegasyonunda instruction eksik.`);
    const kind = inferAssignmentKind(raw, instruction);
    let agent = requestedAgent;
    const unavailable = new Set(cfg.runtimeUnavailableAgents || []);
    if (unavailable.has(agent) || !supportsKind(cfg.agents[agent], kind)) {
      const compatible = Object.entries(cfg.agents).find(([name, candidate]) => name !== operatorName && candidate.enabled !== false && !unavailable.has(name) && supportsKind(candidate, kind));
      if (compatible) agent = compatible[0];
      else if (unavailable.has(agent)) throw new Error(`Operator bu oturumda kullanilamaz agent secti: ${requestedAgent}`);
    }
    return {
      id, agent, kind, instruction,
      requestedAgent: agent === requestedAgent ? undefined : requestedAgent,
      routingReason: agent === requestedAgent ? undefined : `${requestedAgent} ${unavailable.has(requestedAgent) ? "bu oturumda kullanilamaz" : `${kind} yetenegine sahip degil`}; ${agent} secildi.`,
      dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn.map(String) : [],
    };
  });
}

class Engine extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.busy = false;
    this.current = null;
    this.activeChild = null;
    this.callSequence = 0;
    // Kesin kimlik/kurulum hatasi veren agent'lari ayni motor oturumunda tekrar secme.
    // Kalici config'i degistirmeyiz; kullanici kimlik bilgisini duzeltip motoru yeniden
    // baslattiginda agent tekrar denenebilir.
    this.unhealthyAgents = new Map();
  }

  cfg() { return store.loadConfig(); }

  status() {
    const cfg = this.cfg();
    return {
      running: this.running,
      busy: this.busy,
      current: this.current,
      mode: cfg.approvalMode,
      defaultOperator: cfg.operator?.cli || "",
      callsToday: store.getCallCount(),
      budget: cfg.dailyCallBudget,
    };
  }

  publish(type, data, taskId = this.current?.id) {
    const event = { at: new Date().toISOString(), taskId: taskId || null, ...data, type };
    if (taskId) store.appendRunEvent(taskId, event);
    this.emit(type, event);
    return event;
  }

  setMode(mode) {
    const cfg = this.cfg();
    cfg.approvalMode = mode === "auto" ? "auto" : "ask";
    store.saveConfig(cfg);
    this.emit("status", this.status());
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.publish("log", { level: "info", msg: `Motor basladi. Mod=${this.cfg().approvalMode}` }, null);
    this.emit("status", this.status());
    this.loop();
  }

  stop() {
    this.running = false;
    this.wake();
    if (this.activeChild) {
      try { this.activeChild.kill(); } catch {}
    }
    this.publish("log", { level: "warn", msg: "Motor durduruluyor; aktif CLI islemi sonlandirildi." });
    this.emit("status", this.status());
  }

  wake() {
    if (this._wakeResolve) {
      clearTimeout(this._wakeTimer);
      const resolve = this._wakeResolve;
      this._wakeResolve = null;
      resolve();
    }
  }

  sleepWake(ms) {
    return new Promise((resolve) => {
      this._wakeResolve = resolve;
      this._wakeTimer = setTimeout(() => { this._wakeResolve = null; resolve(); }, ms);
    });
  }

  async loop() {
    while (this.running) {
      const task = store.nextPending();
      if (!task) {
        await this.sleepWake((this.cfg().pollSeconds || 15) * 1000);
        continue;
      }
      try {
        await this.runTask(task);
      } catch (error) {
        const found = store.findTask(task.id);
        task.status = "failed";
        task.error = error.message;
        task.finishedAt = new Date().toISOString();
        if (found) store.moveTask(found.state, "failed", task);
        this.publish("log", { level: "error", msg: `HATA: ${error.message}` }, task.id);
        if (task.kind === "operator-chat") {
          const failure = classifyCliError(error);
          this.publish("result", { id: task.id, kind: "operator-chat", parentTaskId: task.parentTaskId, status: "failed", error: failure.summary }, task.id);
        }
        this.emit("queue");
      } finally {
        this.busy = false;
        this.current = null;
        this.activeChild = null;
        this.emit("status", this.status());
      }
    }
  }

  // Uzman agent'i (operatorun altindaki ekip) cfg.agents'ten cozup calistirir.
  invokeAgent(agentName, prompt, cfg, meta = {}) {
    const configuredAgent = cfg.agents[agentName];
    const agent = configuredAgent && cliRegistry.effectiveAgent(configuredAgent);
    if (!agent) return Promise.reject(new Error(`Agent tanimsiz: ${agentName}`));
    return this.runCli(agentName, agent, prompt, cfg, meta);
  }

  // Operatoru, uzman agent'lardan BAGIMSIZ olarak dogrudan CLI'dan (claude/codex/gemini/opencode)
  // calistirir. operator.md rolunu bu CLI giyer.
  invokeOperator(cli, prompt, cfg, meta = {}) {
    const agent = cliRegistry.operatorSpec(cli, cfg);
    if (!agent) return Promise.reject(new Error(`Operator CLI tanimsiz veya kurulu degil: ${cli}`));
    return this.runCli(cli, agent, prompt, cfg, meta);
  }

  runCli(displayName, agent, prompt, cfg, meta = {}) {
    return new Promise((resolve, reject) => {
      const count = store.bumpCallCount();
      if (count > (cfg.dailyCallBudget || Number.MAX_SAFE_INTEGER)) {
        return reject(new Error(`Gunluk cagri butcesi asildi (${cfg.dailyCallBudget}).`));
      }

      const callId = `${this.current?.id || "run"}-${++this.callSequence}`;
      let promptFile = "";
      let useStdin = true;
      const rawArgs = (agent.args || []).map((arg) => {
        if (String(arg).includes("{PROMPT}")) {
          useStdin = false;
          return String(arg).replaceAll("{PROMPT}", prompt);
        }
        if (String(arg).includes("{PROMPT_FILE}")) {
          useStdin = false;
          if (!promptFile) {
            const promptDir = path.join(store.ROOT, "state", "prompts");
            fs.mkdirSync(promptDir, { recursive: true });
            promptFile = path.join(promptDir, `${callId}.md`);
            fs.writeFileSync(promptFile, prompt, "utf8");
          }
          return String(arg).replaceAll("{PROMPT_FILE}", promptFile);
        }
        return String(arg);
      });
      const command = windowsCommand(agent.cmd, rawArgs);
      const file = command.file;
      const args = command.args;
      const cwd = this._cwd || path.resolve(store.ROOT, cfg.workingDir || ".");
      const started = Date.now();
      let stdout = "", stderr = "", settled = false, timedOut = false, timer, forceKillTimer;
      const base = { callId, agent: displayName, stage: meta.stage || "agent", assignmentId: meta.assignmentId || null };

      this.current = { id: this.current?.id, stage: base.stage, agent: displayName, callId };
      this.emit("status", this.status());
      this.publish("activity", { ...base, kind: "process.started", cmd: agent.cmd, args: rawArgs, cwd });

      let child;
      try { child = spawn(file, args, { cwd, windowsHide: true, shell: command.shell, windowsVerbatimArguments: !!command.verbatim }); }
      catch (error) { return reject(error); }
      this.activeChild = child;
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      const timeoutMs = Math.max(10, agent.timeoutSeconds || cfg.agentTimeoutSeconds || 900) * 1000;
      timer = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        try { child.kill(); } catch {}
        this.publish("activity", { ...base, kind: "process.timeout", timeoutMs });
        // Windows'ta shell sonlanirken alt CLI yasamaya devam edebilir. Kisa bir cikis
        // suresinden sonra yalnizca baslattigimiz process agacini zorla kapat.
        forceKillTimer = setTimeout(() => {
          if (settled) return;
          if (isWin && child.pid) {
            try { spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" }); } catch {}
          } else {
            try { child.kill("SIGKILL"); } catch {}
          }
        }, 5000);
      }, timeoutMs);

      child.stdout.on("data", (data) => {
        const text = String(data);
        stdout += text;
        this.publish("activity", { ...base, kind: "stdout", text });
      });
      child.stderr.on("data", (data) => {
        const text = String(data);
        stderr += text;
        this.publish("activity", { ...base, kind: "stderr", text });
      });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(forceKillTimer);
        this.activeChild = null;
        if (promptFile) { try { fs.rmSync(promptFile); } catch {} }
        this.publish("activity", { ...base, kind: "process.failed", error: error.message, durationMs: Date.now() - started });
        reject(error);
      });
      child.on("close", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(forceKillTimer);
        this.activeChild = null;
        if (promptFile) { try { fs.rmSync(promptFile); } catch {} }
        const durationMs = Date.now() - started;
        this.publish("activity", { ...base, kind: "process.finished", exitCode: code, signal, durationMs });
        if (timedOut) return reject(new Error(`${agent.cmd} ${Math.round(timeoutMs / 1000)} saniyede zaman asimina ugradi${signal ? ` (signal=${signal})` : ""}. ${clip(stdout || stderr, 500)}`));
        if (code !== 0) return reject(new Error(`${agent.cmd} cikis kodu ${code ?? "yok"}${signal ? ` (signal=${signal})` : ""}. ${clip(stderr || stdout, 500)}`));
        if (!stdout.trim()) return reject(new Error(`${agent.cmd} bos cikti dondurdu.${stderr ? ` ${clip(stderr, 300)}` : ""}`));
        resolve({ text: stdout.trim(), stderr: stderr.trim(), exitCode: code, durationMs, callId });
      });

      if (useStdin) {
        child.stdin.on("error", () => {});
        child.stdin.end(prompt);
      }
    });
  }

  agentCatalog(cfg, operatorName) {
    return Object.entries(cfg.agents)
      .filter(([name, agent]) => name !== operatorName && agent.enabled !== false && !this.unhealthyAgents.has(name))
      .map(([name, a]) => ({
        name,
        description: a.description || "",
        capabilities: [...capabilitiesFor(a)],
        roleFile: a.roleFile || "",
        costTier: a.costTier || "standard",
      }));
  }

  async invokeOperatorJson(operatorCli, prompt, cfg, stage, label) {
    const retries = Math.max(0, cfg.operator?.protocolRetries ?? 1);
    let lastError;
    let correction = "";
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.invokeOperator(operatorCli, prompt + correction, cfg, { stage });
        return parseJson(response.text, label);
      } catch (error) {
        lastError = error;
        if (attempt >= retries) break;
        correction = `\n\nONCEKI CEVAP PROTOKOLE UYMADI: ${error.message}\nAciklama veya Markdown eklemeden yalnizca istenen JSON nesnesini yeniden dondur.`;
        this.publish("log", { level: "warn", msg: `${label} protokol hatasi; operator yeniden deneniyor (${attempt + 2}/${retries + 1}).` });
      }
    }
    throw lastError;
  }

  operatorPrompt(task, cfg, memory, state, phase) {
    const operatorCli = task.operatorCli || cfg.operator?.cli;
    // Operatör rolü daima operator.md'dir; operatör bir CLI'dir, uzman agent'lar onun altında çalışır.
    const roleFile = cfg.operator?.roleFile || "roles/operator.md";
    const role = store.readRole(path.basename(roleFile));
    const catalog = this.agentCatalog(cfg, operatorCli);
    const protocol = phase === "plan"
      ? `Yalnizca gecerli JSON dondur: {"summary":"yaklasim", "completionCriteria":["..."], "assignments":[{"id":"benzersiz-id", "agent":"catalog-name", "kind":"implement|review|research|plan", "instruction":"net gorev ve teslimat", "dependsOn":[]}]}. En az bir assignment zorunlu.`
      : `Yalnizca gecerli JSON dondur. Is tamamlanmadiysa {"status":"continue", "reason":"...", "assignments":[{"id":"...", "agent":"...", "kind":"implement|review|research|plan", "instruction":"...", "dependsOn":[]}]}; tum kabul kriterleri karsilandiysa {"status":"complete", "final":"en fazla 5 kisa maddeyle ne yapildi", "verification":"tek satir dogrulama"}. Dosya listesini motor ekleyecek; final icinde uzun log veya ham agent cevabi tekrarlama. Continue icin en az bir yeni assignment zorunlu.`;
    const strategy = task.executionMode === "fast"
      ? "HIZLI MOD: Kucuk bir is. Tek bir implementation agenti kullan. Ayri planlama veya review delegasyonu acma; uzman raporu hedefi karsiliyorsa ilk degerlendirmede tamamla."
      : task.executionMode === "deep"
        ? "DERIN MOD: Isi uygun uzmanliklar arasinda dagit — planlama, uygulama, test ve bagimsiz inceleme icin AYRI ve dogru uzmanlari kullan."
        : "DENGELI MOD: Isi uygun uzmanliklar arasinda dagit. Sifirdan bir uygulama/oyun/ozellik ya da cok bilesenli/belirsiz isde once kisa bir PLANLAMA delegasyonu (planlama uzmanina), sonra UYGULAMA, sonra INCELEME ac. Yalnizca kaliteye katki saglayan uzmanlari kullan.";
    return `${role}\n\n---\n## Operator protokolu\n${protocol}\n` +
      `Yalnizca katalogdaki agent adlarini kullan. Kendine gorev atama. Ayni delegasyon id'sini tekrar kullanma.\n` +
      `Bir agent basarisiz veya kullanilamaz raporlandiysa ayni isi ona tekrar verme; katalogdaki alternatif bir uzmani sec.\n` +
      `AJAN SECIMI: Her alt gorevi, katalogdaki YETENEKLERE ve role gore o ise EN UYGUN uzmana ata; tum isi tek bir CLI'ye yigma. Isin ihtiyac duydugu her uzmanlik icin dogru uzmani sec (plan/tasarim -> planlama yetenegi; uygulama -> implementation; inceleme/dogrulama -> review/test; arastirma -> research/web). Ayni KIND icin birden fazla eşdeğer agent varsa YALNIZCA birini (en uygun ve en dusuk maliyetli) kullan; ayni isi iki eşdeğer agente verme. Farkli roller (or. bir uygulayici + bir inceleyici) FARKLI islerdir, tekrar sayilmaz.\n` +
      `## Calisma stratejisi\n${strategy}\n` +
      `## Agent katalogu\n${JSON.stringify(catalog, null, 2)}\n` +
      `## Kullanici gorevi\n${task.prompt}\n` +
      `## Calisma klasoru\n${this._cwd}\n` +
      `## Proje hafizasi\n${clip(memory, cfg.memoryCharBudget || 8000)}\n` +
      (phase === "review" ? `## Takim calisma kaydi\n${clip(JSON.stringify(state, null, 2), cfg.teamContextCharBudget || 30000)}\n` : "");
  }

  specialistPrompt(task, cfg, assignment, state) {
    const agent = cfg.agents[assignment.agent];
    const roleByKind = { implement: "executor.md", review: "reviewer.md", plan: "planner.md" };
    const selectedRole = roleByKind[assignment.kind] || (agent.roleFile ? path.basename(agent.roleFile) : "executor.md");
    const role = store.readRole(selectedRole);
    const instructionByKind = {
      implement: "Delegasyonu calisma klasorunde uygula, degisiklikleri dogrula ve rolundeki teslimat formatinda raporla.",
      review: "Teslimati bagimsiz ve salt okunur olarak incele; gerekli kontrolleri calistir, dosyalari degistirme ve rolundeki karar formatinda raporla.",
      plan: "Calisma klasorunu salt okunur olarak incele; hicbir dosyayi degistirmeden uygulanabilir plani rolundeki formatta raporla.",
      research: "Delegasyon kapsaminda kanit topla; kaynaklari ve belirsizlikleri ayirarak kisa bir sonuc raporla.",
    };
    const completed = Object.values(state.results).map((r) => ({
      id: r.id, agent: r.agent, instruction: r.instruction, result: clip(r.result, 5000),
    }));
    return `${role}\n\n---\n## Takim agenti protokolu\n` +
      `Operator sana asagidaki isi devretti. ${instructionByKind[assignment.kind] || instructionByKind.implement} ` +
      `Planda olmayan riskli bir is gerekiyorsa yapma; BLOCKED olarak bildir. Yalnizca gercekten gozlemledigin veya dogruladigin sonuclari yaz.\n` +
      `## Ana hedef\n${task.prompt}\n## Delegasyon\nID: ${assignment.id}\n${assignment.instruction}\n` +
      `## Onceki tamamlanan takim isleri\n${clip(JSON.stringify(completed, null, 2), cfg.teamContextCharBudget || 30000)}`;
  }

  async runAssignments(task, cfg, assignments, state) {
    const pending = assignments.slice();
    while (pending.length) {
      let index = pending.findIndex((a) => a.dependsOn.every((id) => state.results[id]?.status === "completed"));
      if (index < 0) {
        index = pending.findIndex((a) => a.dependsOn.some((id) => state.results[id] && state.results[id].status !== "completed"));
        if (index >= 0) {
          const blocked = pending.splice(index, 1)[0];
          state.usedIds.push(blocked.id);
          const failedDeps = blocked.dependsOn.filter((id) => state.results[id]?.status !== "completed");
          state.results[blocked.id] = { ...blocked, status: "blocked", result: `Bagimli gorev basarisiz: ${failedDeps.join(", ")}` };
          const blockedMessage = { from: "system", to: task.operatorCli, messageType: "blocked", assignmentId: blocked.id, body: `${blocked.id} calistirilmadi; bagimli gorev basarisiz: ${failedDeps.join(", ")}`, at: new Date().toISOString() };
          state.messages.push(blockedMessage);
          this.publish("message", blockedMessage, task.id);
          continue;
        }
        throw new Error(`Delegasyon bagimliliklari cozumlenemedi: ${pending.map((a) => a.id).join(", ")}`);
      }
      const assignment = pending.splice(index, 1)[0];
      state.usedIds.push(assignment.id);
      state.messages.push({ from: task.operatorCli, to: assignment.agent, messageType: "delegation", assignmentId: assignment.id, body: assignment.instruction, at: new Date().toISOString() });
      this.publish("message", state.messages[state.messages.length - 1], task.id);
      if (assignment.routingReason) this.publish("log", { level: "info", msg: `Otomatik yonlendirme: ${assignment.routingReason}` }, task.id);
      this.publish("log", { level: "stage", msg: `DELEGE ${assignment.id} -> ${assignment.agent}` }, task.id);
      try {
        const response = await this.invokeAgent(
          assignment.agent,
          this.specialistPrompt(task, cfg, assignment, state),
          cfg,
          { stage: "delegate", assignmentId: assignment.id }
        );
        const result = { ...assignment, status: "completed", result: response.text, durationMs: response.durationMs, callId: response.callId };
        state.results[assignment.id] = result;
        const message = { from: assignment.agent, to: task.operatorCli, messageType: "result", assignmentId: assignment.id, body: response.text, at: new Date().toISOString() };
        state.messages.push(message);
        this.publish("message", message, task.id);
      } catch (error) {
        const failure = classifyCliError(error);
        if (QUARANTINE_CLI_ERRORS.has(failure.code)) {
          this.unhealthyAgents.set(assignment.agent, { code: failure.code, at: new Date().toISOString() });
          cfg.runtimeUnavailableAgents = [...this.unhealthyAgents.keys()];
        }
        state.results[assignment.id] = { ...assignment, status: "failed", result: failure.summary, error: failure };
        const message = { from: assignment.agent, to: task.operatorCli, messageType: "failure", assignmentId: assignment.id, body: `${failure.summary}\n${failure.action}`, errorCode: failure.code, at: new Date().toISOString() };
        state.messages.push(message);
        this.publish("message", message, task.id);
        this.publish("log", { level: "warn", msg: `${assignment.agent} kullanilamadi [${failure.code}]. Operator alternatif agent sececek.` }, task.id);
      }
      task.teamState = state;
      store.saveTask("pending", task);
    }
  }

  isRisky(text, cfg) {
    const lower = String(text).toLowerCase();
    return (cfg.riskyPatterns || []).some((pattern) => lower.includes(String(pattern).toLowerCase()));
  }

  async runTask(task) {
    const baseCfg = this.cfg();
    if (task.kind === "operator-chat") return this.runChatTask(task, baseCfg);
    task.executionMode = resolveExecutionMode(task);
    const cfg = applyExecutionPolicy(baseCfg, task.executionMode);
    const operatorCli = task.operatorCli || cfg.operator?.cli;
    if (!operatorCli || !cliRegistry.operatorSpec(operatorCli, cfg)) throw new Error("Gecerli bir operator CLI secilmedi (claude/codex/gemini/opencode).");
    task.operatorCli = operatorCli;
    this.busy = true;
    this.current = { id: task.id, stage: "operator", agent: operatorCli };
    this._cwd = path.resolve(store.ROOT, task.targetDir || cfg.workingDir || ".");
    this._snapBefore = snapshotDir(this._cwd);
    this.publish("log", { level: "task", msg: `GOREV ${task.id}: ${task.prompt}` }, task.id);
    this.publish("log", { level: "info", msg: `Calisma modu: ${task.executionMode.toUpperCase()} · en fazla ${cfg.operator.maxRounds} tur / ${cfg.operator.maxDelegationsPerRound} delegasyon` }, task.id);
    this.emit("status", this.status());
    this.emit("queue");

    cfg.runtimeUnavailableAgents = [...this.unhealthyAgents.keys()];
    const memory = store.getMemory(cfg.memoryCharBudget);
    const state = task.teamState || { round: 0, plan: null, criteria: [], results: {}, messages: [], operatorDecisions: [], usedIds: [] };
    const usedIds = new Set(state.usedIds || []);

    let assignments;
    if (state.plan && task.approved) {
      assignments = normalizeAssignments(state.plan.assignments, cfg, operatorCli, usedIds);
      this.publish("log", { level: "info", msg: "Onaylanmis operator plani degistirilmeden devam ettiriliyor." }, task.id);
    } else {
      const plan = await this.invokeOperatorJson(operatorCli, this.operatorPrompt(task, cfg, memory, state, "plan"), cfg, "operator-plan", "Operator plani");
      assignments = normalizeAssignments(plan.assignments, cfg, operatorCli, usedIds);
      state.plan = { summary: String(plan.summary || ""), completionCriteria: Array.isArray(plan.completionCriteria) ? plan.completionCriteria.map(String) : [], assignments };
      state.criteria = state.plan.completionCriteria;
      state.operatorDecisions.push({ round: 0, ...state.plan });
      task.teamState = state;
      task.planPreview = JSON.stringify(state.plan, null, 2);
      store.saveTask("pending", task);
      if (cfg.approvalMode === "ask" && this.isRisky(task.planPreview, cfg)) {
        task.status = "awaiting-approval";
        task.planHash = store.hashText(task.planPreview);
        store.moveTask("pending", "approval", task);
        this.publish("log", { level: "warn", msg: "Riskli operator plani insan onayina alindi." }, task.id);
        this.busy = false;
        this.current = null;
        this.emit("queue");
        this.emit("status", this.status());
        return;
      }
    }

    const maxRounds = Math.max(1, cfg.operator?.maxRounds || 6);
    const maxRecoveryRounds = Math.max(0, cfg.operator?.maxInfrastructureRecoveryRounds ?? 2);
    let recoveryRounds = 0;
    while (this.running && state.round < maxRounds + recoveryRounds) {
      state.round++;
      await this.runAssignments(task, cfg, assignments, state);
      const infrastructureFailures = assignments.filter((assignment) => {
        const result = state.results[assignment.id];
        return result?.status === "failed" && RECOVERABLE_CLI_ERRORS.has(result.error?.code);
      });
      if (infrastructureFailures.length && recoveryRounds < maxRecoveryRounds) {
        recoveryRounds++;
        this.publish("log", { level: "warn", msg: `CLI altyapi hatasi tur butcesinden dusulmedi; ${maxRecoveryRounds - recoveryRounds} ek kurtarma turu kaldi.` }, task.id);
      }
      if (task.executionMode === "fast" && assignments.every((assignment) => state.results[assignment.id]?.status === "completed")) {
        const reports = assignments.map((assignment) => state.results[assignment.id].result).join("\n\n");
        this.publish("log", { level: "info", msg: "FAST mod: uzman teslimati basarili; ikinci operator degerlendirme cagrisi atlandi." }, task.id);
        return this.complete(task, state, "done", reports, {});
      }
      const decision = await this.invokeOperatorJson(operatorCli, this.operatorPrompt(task, cfg, memory, state, "review"), cfg, "operator-review", "Operator karari");
      state.operatorDecisions.push({ round: state.round, ...decision });
      task.teamState = state;
      store.saveTask("pending", task);
      if (String(decision.status).toLowerCase() === "complete") {
        if (!String(decision.final || "").trim()) throw new Error("Operator complete dedi fakat final sonucu bos birakti.");
        return this.complete(task, state, "done", String(decision.final), decision);
      }
      if (String(decision.status).toLowerCase() !== "continue") throw new Error("Operator status alani continue veya complete olmali.");
      assignments = normalizeAssignments(decision.assignments, cfg, operatorCli, new Set(state.usedIds));
    }
    throw new Error(`Operator ${state.round} tur sonunda gorevi tamamlayamadi${recoveryRounds ? ` (${recoveryRounds} CLI kurtarma turu kullanildi)` : ""}.`);
  }

  async runChatTask(task, cfg) {
    const parentFound = store.findTask(task.parentTaskId);
    if (!parentFound) throw new Error("Sohbetin bagli oldugu tamamlanmis gorev bulunamadi.");
    const parent = parentFound.task;
    let operatorCli = parent.operatorCli;
    if (!operatorCli || !cliRegistry.operatorSpec(operatorCli, cfg)) operatorCli = cfg.operator?.cli;
    if (!operatorCli || !cliRegistry.operatorSpec(operatorCli, cfg)) throw new Error("Sohbet icin operator CLI bulunamadi.");
    this.busy = true;
    this.current = { id: task.id, stage: "operator-chat", agent: operatorCli };
    this._cwd = path.resolve(store.ROOT, parent.targetDir || cfg.workingDir || ".");
    this.publish("log", { level: "task", msg: `OPERATOR SOHBETI ${parent.id}: ${task.prompt}` }, task.id);
    this.emit("status", this.status());

    const role = store.readRole("operator-chat.md");
    const resultContext = Object.values(parent.teamState?.results || {}).map((result) => ({
      id: result.id, agent: result.agent, status: result.status, result: clip(result.result, 1800),
    }));
    const prompt = `${role}\n\n---\n## Tamamlanmis gorev hakkinda takip sohbeti\n` +
      `Kullanici daha once tamamladiginiz gorev hakkinda soru soruyor. Yeni dosya degistirme, arac kullanma veya delegasyon yapma. ` +
      `Asagidaki kayitlara dayanarak dogrudan, kisa ve acik cevap ver. Bilmiyorsan bunu belirt.\n` +
      `## Gorev kimligi\n${parent.id}\n## Gorev\n${parent.prompt}\n## Teslimat\n${JSON.stringify(parent.delivery || { summary: parent.summary, changes: parent.changes }, null, 2)}\n` +
      `## Takim raporlari\n${clip(JSON.stringify(resultContext, null, 2), 12000)}\n` +
      `## Onceki sohbet\n${clip(JSON.stringify(parent.conversation || [], null, 2), 8000)}\n## Yeni soru\n${task.prompt}`;
    const response = await this.invokeOperator(operatorCli, prompt, cfg, { stage: "operator-chat" });
    const entry = { question: task.prompt, answer: response.text, at: new Date().toISOString(), taskId: task.id };
    parent.conversation ||= [];
    parent.conversation.push(entry);
    store.saveTask(parentFound.state, parent);
    task.status = "done";
    task.finishedAt = new Date().toISOString();
    task.final = response.text;
    task.summary = clip(response.text, 1000);
    store.moveTask("pending", "done", task);
    this.publish("result", { id: task.id, kind: "operator-chat", parentTaskId: parent.id, answer: response.text, status: "done", operator: operatorCli }, task.id);
    this.publish("log", { level: "ok", msg: `Operator soruyu yanitladi: ${parent.id}` }, task.id);
    this.emit("queue");
  }

  complete(task, state, status, finalText, decision = {}) {
    const changes = diffSnapshots(this._snapBefore || new Map(), snapshotDir(this._cwd));
    task.status = status;
    task.finishedAt = new Date().toISOString();
    const files = [
      ...changes.created.map((file) => ({ path: file, action: "created" })),
      ...changes.modified.map((file) => ({ path: file, action: "modified" })),
      ...changes.deleted.map((file) => ({ path: file, action: "deleted" })),
    ];
    const concise = clip(String(finalText).replace(/\n{3,}/g, "\n\n"), 700);
    let verification = String(decision.verification || "").trim();
    if (!verification) {
      for (const result of Object.values(state.results)) {
        const match = String(result.result || "").match(/DO(?:Ğ|G\u0306|G)RULAMA:\s*([^\n`]+)/i);
        if (match) { verification = match[1].trim(); break; }
      }
    }
    task.summary = concise;
    task.final = finalText;
    task.changes = changes;
    task.delivery = {
      summary: concise,
      files,
      location: this._cwd,
      verification,
      mode: task.executionMode,
      rounds: state.round,
      agents: [...new Set(Object.values(state.results).map((result) => result.agent))],
    };
    task.teamState = state;
    const found = store.findTask(task.id);
    store.moveTask(found?.state || "pending", status, task);
    store.appendMemory(`${task.id} [${status}] ${task.prompt}`, `${task.summary}\nDosyalar: ${[...changes.created, ...changes.modified, ...changes.deleted].join(", ")}`);
    this.publish("result", { id: task.id, prompt: task.prompt, status, dir: this._cwd, changes, summary: task.summary, delivery: task.delivery, operator: task.operatorCli, rounds: state.round }, task.id);
    this.publish("log", { level: "ok", msg: `GOREV tamamlandi: ${task.id}` }, task.id);
    this.emit("queue");
  }
}

module.exports = new Engine();
