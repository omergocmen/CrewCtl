// engine.js — pipeline motoru. Olay yayar (EventEmitter), server SSE'ye aktarir.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const store = require("./store");

const isWin = process.platform === "win32";

// --- Dosya sistemi anlik goruntusu (nerede ne degisti tespiti) ---
function snapshotDir(dir) {
  const map = new Map();
  const skip = (rel) => {
    const r = rel.replace(/\\/g, "/");
    return (
      r.includes("node_modules") ||
      r.includes(".git/") ||
      r.startsWith(".git") ||
      r.startsWith("orchestrator/queue") ||
      r.startsWith("orchestrator/state") ||
      r.startsWith("orchestrator/memory") ||
      r.startsWith("orchestrator/node_modules")
    );
  };
  let count = 0;
  const walk = (abs, rel) => {
    if (count > 8000) return;
    let ents;
    try {
      ents = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const childRel = rel ? rel + "/" + e.name : e.name;
      if (skip(childRel)) continue;
      const childAbs = path.join(abs, e.name);
      if (e.isDirectory()) walk(childAbs, childRel);
      else {
        try {
          map.set(childRel, fs.statSync(childAbs).mtimeMs);
          count++;
        } catch {}
      }
    }
  };
  walk(dir, "");
  return map;
}
function diffSnapshots(before, after) {
  const created = [];
  const modified = [];
  for (const [k, v] of after) {
    if (!before.has(k)) created.push(k);
    else if (before.get(k) !== v) modified.push(k);
  }
  return { created: created.sort(), modified: modified.sort() };
}
function extractSummary(stageOutputs) {
  const exec = stageOutputs.execute || stageOutputs.plan || "";
  const m = exec.match(/YAPILANLAR:\s*([\s\S]*?)(?:\n\s*DO[ĞG]RULAMA:|```|$)/i);
  const s = (m ? m[1] : exec).trim();
  return s.slice(0, 900);
}

class Engine extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.busy = false;
    this.current = null; // { id, stage }
  }

  cfg() {
    return store.loadConfig();
  }

  status() {
    return {
      running: this.running,
      busy: this.busy,
      current: this.current,
      mode: this.cfg().approvalMode,
      callsToday: store.getCallCount(),
      budget: this.cfg().dailyCallBudget,
    };
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
    this.emit("log", { level: "info", msg: `Motor basladi. Mod=${this.cfg().approvalMode}` });
    this.emit("status", this.status());
    this.loop();
  }

  stop() {
    this.running = false;
    this.wake();
    this.emit("log", { level: "info", msg: "Motor durduruldu (mevcut gorev bitince)." });
    this.emit("status", this.status());
  }

  // Kuyruga gorev eklenince beklemeden hemen uyan
  wake() {
    if (this._wakeResolve) {
      clearTimeout(this._wakeTimer);
      const r = this._wakeResolve;
      this._wakeResolve = null;
      r();
    }
  }
  sleepWake(ms) {
    return new Promise((r) => {
      this._wakeResolve = r;
      this._wakeTimer = setTimeout(() => { this._wakeResolve = null; r(); }, ms);
    });
  }

  async loop() {
    while (this.running) {
      const task = store.nextPending();
      if (task) {
        try {
          await this.runTask(task);
        } catch (e) {
          this.emit("log", { level: "error", msg: `HATA: ${e.message}` });
          task.error = e.message;
          store.moveTask("pending", "failed", task);
          this.emit("queue");
        }
      } else {
        await this.sleepWake((this.cfg().pollSeconds || 15) * 1000);
      }
    }
    this.busy = false;
    this.current = null;
    this.emit("status", this.status());
  }

  // Bir agent'i spawn et, prompt'u stdin'e yaz, stdout'u canli yayinla
  spawnAgent(agentName, prompt, cfg) {
    return new Promise((resolve, reject) => {
      const a = cfg.agents[agentName];
      if (!a) return reject(new Error(`Agent tanimsiz: ${agentName}`));

      const n = store.bumpCallCount();
      if (n > (cfg.dailyCallBudget || 1e9)) {
        return reject(new Error(`Gunluk cagri butcesi asildi (${cfg.dailyCallBudget}).`));
      }

      // {PROMPT} token'i varsa argumana goem, yoksa stdin'den ver
      let useStdin = true;
      const rawArgs = (a.args || []).map((x) => {
        if (String(x).includes("{PROMPT}")) {
          useStdin = false;
          return String(x).replace("{PROMPT}", prompt);
        }
        return x;
      });

      const cwd = this._cwd || path.resolve(store.ROOT, cfg.workingDir || ".");
      // Windows'ta .cmd shim'leri icin cmd.exe /c uzerinden calistir
      const file = isWin ? process.env.ComSpec || "cmd.exe" : a.cmd;
      const args = isWin ? ["/c", a.cmd, ...rawArgs] : rawArgs;

      const t0 = Date.now();
      const stage = this.current && this.current.stage;
      const child = spawn(file, args, { cwd, windowsHide: true });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      let out = "";
      let err = "";
      let first = false;

      // CLI process fiilen baslatildi (henuz cikti yok)
      this.emit("agent", { agent: agentName, cmd: a.cmd, stage, phase: "start" });

      child.stdout.on("data", (d) => {
        const s = d.toString();
        if (!first) { first = true; this.emit("agent", { agent: agentName, phase: "responding", ms: Date.now() - t0 }); }
        out += s;
        this.emit("chunk", { agent: agentName, text: s });
      });
      child.stderr.on("data", (d) => (err += d.toString()));
      child.on("error", (e) => {
        this.emit("agent", { agent: agentName, phase: "done", ms: Date.now() - t0, ok: false });
        reject(e);
      });
      child.on("close", (code) => {
        this.emit("agent", { agent: agentName, phase: "done", ms: Date.now() - t0, ok: code === 0 || !!out.trim() });
        if (code !== 0 && !out.trim()) {
          reject(new Error(`${a.cmd} cikis kodu ${code}. ${err.slice(0, 300)}`));
        } else {
          resolve(out.trim());
        }
      });

      if (useStdin) {
        child.stdin.write(prompt);
        child.stdin.end();
      }
    });
  }

  buildPrompt(roleFile, task, memory, stageOutputs) {
    const role = store.readRole(path.basename(roleFile));
    let p = role + "\n\n---\n## Ortak Hafiza (gecmis islerden)\n" + memory;
    p += "\n\n---\n## Gorev\n" + task.prompt;
    const keys = Object.keys(stageOutputs);
    if (keys.length) {
      p += "\n\n---\n## Onceki Asamalarin Ciktilari";
      for (const k of keys) p += `\n### ${k}\n${stageOutputs[k]}\n`;
    }
    return p;
  }

  isRisky(text, cfg) {
    return (cfg.riskyPatterns || []).some((pat) =>
      text.toLowerCase().includes(String(pat).toLowerCase())
    );
  }

  async runTask(task) {
    const cfg = this.cfg();
    this.busy = true;
    this._cwd = path.resolve(store.ROOT, task.targetDir || cfg.workingDir || ".");
    this._snapDir = this._cwd;
    this._snapBefore = snapshotDir(this._snapDir);
    this.emit("log", { level: "task", msg: `GOREV basladi: ${task.id} — ${task.prompt}` });
    this.emit("queue");

    const memory = store.getMemory(cfg.memoryCharBudget);
    const stageOutputs = {};
    let iter = 0;
    let i = 0;

    while (i < cfg.pipeline.length && this.running) {
      const step = cfg.pipeline[i];
      this.current = { id: task.id, stage: step.stage, agent: step.agent };
      this.emit("status", this.status());
      this.emit("log", { level: "stage", msg: `  → ${step.stage} [${step.agent}]` });

      const prompt = this.buildPrompt(step.roleFile, task, memory, stageOutputs);
      const out = await this.spawnAgent(step.agent, prompt, cfg);
      stageOutputs[step.stage] = out;

      // --- Onay kapisi ---
      if (step.gate && this.isRisky(out, cfg) && cfg.approvalMode === "ask" && !task.approved) {
        this.emit("log", { level: "warn", msg: `  ⚠ Riskli plan → ONAYA alindi` });
        task.planPreview = out;
        task.status = "awaiting-approval";
        task.stageOutputs = stageOutputs;
        store.moveTask("pending", "approval", task);
        this.busy = false;
        this.current = null;
        this.emit("queue");
        this.emit("status", this.status());
        return;
      }

      // --- Denetci FAIL → geri don ---
      if (step.loopBackTo) {
        const m = out.match(/VERDICT:\s*(PASS|FAIL)/i);
        const verdict = m ? m[1].toUpperCase() : "";
        if (verdict === "FAIL" && iter < (cfg.maxIterationsPerTask || 3) - 1) {
          iter++;
          this.emit("log", {
            level: "warn",
            msg: `  Denetci FAIL → '${step.loopBackTo}' asamasina donuluyor (tur ${iter + 1}/${cfg.maxIterationsPerTask})`,
          });
          i = cfg.pipeline.findIndex((s) => s.stage === step.loopBackTo);
          if (i < 0) i = 0;
          continue;
        }
        if (verdict === "FAIL") {
          this.emit("log", { level: "error", msg: `  Denetci hala FAIL, tur limiti doldu → FAILED` });
          return this.complete(task, stageOutputs, "failed");
        }
      }
      i++;
    }

    if (this.running) this.complete(task, stageOutputs, "done");
  }

  inferRunHint(stageOutputs, changes, dir) {
    const exec = stageOutputs.execute || "";
    const m = exec.match(/DO[ĞG]RULAMA:\s*([^\n`]+)/i);
    if (m && m[1].trim() && !/^yok/i.test(m[1].trim())) return m[1].trim();
    const all = changes.created.concat(changes.modified);
    const html = all.find((f) => f.endsWith(".html"));
    if (html) return "Tarayıcıda aç: " + path.join(dir, html);
    if (all.some((f) => f.endsWith("package.json"))) return "npm install && npm start";
    const py = all.find((f) => f.endsWith(".py"));
    if (py) return "python " + path.join(dir, py);
    return "";
  }

  complete(task, stageOutputs, result) {
    // Gercek dosya degisikliklerini tespit et
    let changes = { created: [], modified: [] };
    try {
      changes = diffSnapshots(this._snapBefore || new Map(), snapshotDir(this._snapDir));
    } catch {}

    task.status = result;
    task.finishedAt = new Date().toISOString();
    task.stageOutputs = stageOutputs;
    task.changes = changes;
    task.runHint = this.inferRunHint(stageOutputs, changes, this._snapDir);
    task.summary = extractSummary(stageOutputs);

    const fromState = store.findTask(task.id)?.state || "pending";
    store.moveTask(fromState, result, task);

    const memNote =
      task.summary +
      (changes.created.length ? `\nDosyalar: ${changes.created.join(", ")}` : "");
    store.appendMemory(`${task.id} [${result}] ${task.prompt}`, memNote);

    this.busy = false;
    this.current = null;
    this.emit("log", { level: result === "done" ? "ok" : "error", msg: `GOREV bitti: ${task.id} [${result}]` });
    this.emit("result", {
      id: task.id,
      prompt: task.prompt,
      status: result,
      dir: this._snapDir,
      changes,
      runHint: task.runHint,
      summary: task.summary,
    });
    this.emit("queue");
    this.emit("status", this.status());
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = new Engine();
