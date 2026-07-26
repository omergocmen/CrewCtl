// DISA DONUK MCP SUNUCUSU. CrewCtl'i baska bir kodlama ajanina (Claude Code, Codex, Gemini,
// OpenCode) arac olarak sunar: ajan kendi akisindan gorev kuyruga ekleyebilir, durum okuyabilir.
// "Panoyu AI icin API yapmak" — Vibe Kanban ve Conductor OSS'in de yaptigi yon.
//
// MIMARI: Bu surec CrewCtl'in kendisi DEGIL, calisan panelin HTTP API'sinin bir ISTEMCISIDIR.
// Boylece store'a ikinci bir yazar eklenmez ve motor kontrolu gercekten calisan motoru etkiler.
// Panel kapaliysa araclar net bir yonlendirme mesaji doner.
//
// TRANSPORT: stdio uzerinde satir-sonu ile ayrilmis JSON-RPC 2.0. stdout YALNIZCA protokol
// mesajlari icindir; her turlu teshis stderr'e yazilir (aksi halde istemci parse hatasi alir).
"use strict";

const http = require("http");
const store = require("./store");

const VERSION = require("../../package.json").version;

// MCP surumleri tarihlidir. Istemcinin istedigi surumu destekliyorsak AYNISIYLA yanit vermeliyiz;
// desteklemiyorsak kendi en yeni surumumuzu doneriz (spec: version negotiation).
// NOT (2026-07-25): 2026-07-28 revizyonu initialize/initialized el sikismasini KALDIRIYOR ve
// surum bilgisini her istekteki `_meta` ile tasiyor. Bu yuzden burada el sikisma ZORUNLU
// tutulmaz: initialize gelmeden gelen tools/list veya tools/call da yanitlanir ve `server/discover`
// bir es-anlamli olarak sunulur. Boylece hem klasik hem stateless istemciler calisir.
const SUPPORTED_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST_PROTOCOL = SUPPORTED_PROTOCOLS[0];

const INSTRUCTIONS = [
  "CrewCtl, kurulu kodlama CLI'larini (Codex/Claude/Gemini/OpenCode) operator liderliginde bir takim olarak calistiran yerel bir orkestratordur.",
  "Uzun surecek, cok adimli veya paralel yurutulebilir isleri crewctl_add_task ile devret; sonra crewctl_task_status ile ilerlemeyi izle.",
  "Gorevler kuyruga alinir ve YALNIZCA motor calisirken yurutulur; motor durmussa kullaniciya panelden baslatmasini soyle.",
  "Kucuk ve hizli duzenlemeleri kendin yap; devretmenin degeri uzun veya cok-ajanli islerdedir.",
].join(" ");

function baseUrl() {
  if (process.env.CREWCTL_URL) return String(process.env.CREWCTL_URL).replace(/\/+$/, "");
  const host = process.env.HOST || "127.0.0.1";
  const port = process.env.PORT || 4317;
  return `http://${host}:${port}`;
}

// Panel kapaliyken kullaniciya ne yapmasi gerektigini soyleyen tek mesaj.
function offlineMessage() {
  return `CrewCtl paneli ${baseUrl()} adresinde yanit vermiyor. Kullanicidan paneli baslatmasini isteyin: \`npx @omerrgocmen/crewctl\` (veya kuruluysa \`crewctl start\`). Farkli port kullaniliyorsa PORT ortam degiskenini ayni degere ayarlayin.`;
}

// Zero-dependency HTTP istemcisi. Panel yereldir; kisa timeout yeterli ve asili kalmayi onler.
function api(method, path, body) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(baseUrl() + path); }
    catch (error) { return reject(new Error(`Gecersiz CrewCtl adresi: ${error.message}`)); }
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method,
        headers: data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {},
      },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { buf += chunk; });
        res.on("end", () => {
          let parsed = buf;
          try { parsed = JSON.parse(buf); } catch {}
          if (res.statusCode >= 400) {
            const detail = parsed && typeof parsed === "object" && parsed.error ? parsed.error : `HTTP ${res.statusCode}`;
            return reject(new Error(String(detail)));
          }
          resolve(parsed);
        });
      },
    );
    req.on("error", () => reject(new Error(offlineMessage())));
    req.setTimeout(20000, () => { req.destroy(new Error("CrewCtl paneli 20 sn icinde yanit vermedi.")); });
    if (data) req.write(data);
    req.end();
  });
}

// Motor kontrolu OPT-IN'dir: harici bir ajanin otonom kosumu kendi basina baslatmasi kullanicinin
// acik tercihi olmali. config.mcpServer.allowEngineControl ile acilir.
function engineControlAllowed() {
  try { return store.loadConfig()?.mcpServer?.allowEngineControl === true; }
  catch { return false; }
}

const MODES = ["auto", "fast", "balanced", "deep"];

function toolDefinitions() {
  const tools = [
    {
      name: "crewctl_add_task",
      description: "CrewCtl kuyruguna yeni bir gorev ekler. Gorev, operator liderligindeki CLI ajan takimi tarafindan yurutulur. Uzun surecek veya cok adimli isler icin kullan. Gorev kuyruga alinir; yurutme yalnizca motor calisirken baslar.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Yapilacak isin net tanimi. Kabul kriterlerini de yaz." },
          directory: { type: "string", description: "Calisma klasorunun mutlak yolu. Verilmezse projenin veya yapilandirmanin varsayilani kullanilir." },
          projectId: { type: "string", description: "Kayitli bir CrewCtl projesinin kimligi. Verilirse klasor/operator/mod varsayilanlari projeden gelir." },
          mode: { type: "string", enum: MODES, description: "Yurutme modu. auto = motor karar verir; fast = tek uzman; balanced = plan+uygulama+inceleme; deep = genis dagitim." },
          operator: { type: "string", enum: ["codex", "claude", "gemini", "opencode"], description: "Takimi yonetecek operator CLI. Verilmezse yapilandirmadaki varsayilan kullanilir." },
          fresh: { type: "boolean", description: "true ise birikmis proje profili (.crewctl/CONTEXT.md) yuklenmez; temiz sayfadan baslanir." },
        },
        required: ["prompt"],
      },
    },
    {
      name: "crewctl_task_status",
      description: "Bir CrewCtl gorevinin guncel durumunu, ozetini, degisen dosyalarini ve dogrulama sonucunu dondurur.",
      inputSchema: {
        type: "object",
        properties: { taskId: { type: "string", description: "crewctl_add_task'in dondurdugu gorev kimligi." } },
        required: ["taskId"],
      },
    },
    {
      name: "crewctl_list_tasks",
      description: "CrewCtl kuyrugunu listeler: bekleyen, onay bekleyen, tamamlanan ve basarisiz gorevler.",
      inputSchema: {
        type: "object",
        properties: {
          state: { type: "string", enum: ["pending", "approval", "done", "failed", "all"], description: "Filtrelenecek durum. Varsayilan: all." },
          limit: { type: "number", description: "Durum basina dondurulecek en fazla gorev sayisi (1-50). Varsayilan 10." },
        },
      },
    },
    {
      name: "crewctl_engine_status",
      description: "CrewCtl motorunun durumunu dondurur: calisiyor mu, su anda hangi ajan hangi evrede, gunluk cagri butcesi ne kadar kullanilmis.",
      inputSchema: { type: "object", properties: {} },
    },
  ];
  if (engineControlAllowed()) {
    tools.push({
      name: "crewctl_engine_control",
      description: "CrewCtl motorunu baslatir veya durdurur. Baslatmak, kuyruktaki gorevlerin otonom olarak yurutulmesine yol acar; kullanicinin bunu bekledigi durumlarda kullan.",
      inputSchema: {
        type: "object",
        properties: { action: { type: "string", enum: ["start", "stop"], description: "start = kuyrugu yurutmeye basla; stop = yeni gorev almayi durdur." } },
        required: ["action"],
      },
    });
  }
  return tools;
}

function text(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

// Arac YURUTME hatasi protokol hatasi degildir: isError:true ile donerse cagiran model hatayi
// gorup duzeltebilir. JSON-RPC error yalnizca bozuk protokol mesajlari icin kullanilir.
function toolError(message) {
  return { content: [{ type: "text", text: `HATA: ${message}` }], isError: true };
}

function summarizeTask(task) {
  if (!task || typeof task !== "object") return task;
  return {
    id: task.id,
    status: task.status || null,
    prompt: task.prompt,
    mode: task.executionMode || null,
    operator: task.operatorCli || null,
    createdAt: task.createdAt || null,
    finishedAt: task.finishedAt || null,
    summary: task.summary || null,
    ...(task.delivery ? {
      delivery: {
        files: task.delivery.files || [],
        verification: task.delivery.verification || "",
        warnings: task.delivery.warnings || [],
        rounds: task.delivery.rounds ?? null,
        agents: task.delivery.agents || [],
        ...(task.delivery.verify ? { verify: task.delivery.verify } : {}),
      },
    } : {}),
  };
}

async function callTool(name, args = {}) {
  const input = args && typeof args === "object" ? args : {};
  switch (name) {
    case "crewctl_add_task": {
      const prompt = String(input.prompt || "").trim();
      if (!prompt) return toolError("prompt bos olamaz.");
      if (input.mode !== undefined && !MODES.includes(String(input.mode))) return toolError(`mode su degerlerden biri olmali: ${MODES.join(", ")}`);
      const created = await api("POST", "/api/tasks", {
        prompt,
        ...(input.directory ? { targetDir: String(input.directory) } : {}),
        ...(input.projectId ? { projectId: String(input.projectId) } : {}),
        ...(input.mode ? { executionMode: String(input.mode) } : {}),
        ...(input.operator ? { operatorCli: String(input.operator) } : {}),
        ...(input.fresh ? { freshContext: true } : {}),
      });
      const status = await api("GET", "/api/state").then((s) => s.status).catch(() => null);
      const note = status && !status.running
        ? " NOT: Motor su anda DURMUS durumda; gorev kuyrukta bekliyor ve panelden Baslat'a basilana kadar yurutulmez."
        : "";
      return text(`Gorev kuyruga eklendi.${note}\n${JSON.stringify(summarizeTask(created), null, 2)}`);
    }
    case "crewctl_task_status": {
      const taskId = String(input.taskId || "").trim();
      if (!taskId) return toolError("taskId gerekli.");
      const found = await api("GET", `/api/tasks/${encodeURIComponent(taskId)}`);
      return text(summarizeTask(found.task || found));
    }
    case "crewctl_list_tasks": {
      const state = String(input.state || "all");
      const limit = Math.min(50, Math.max(1, Number(input.limit) || 10));
      const { queue } = await api("GET", "/api/state");
      const states = state === "all" ? ["pending", "approval", "done", "failed"] : [state];
      const out = {};
      for (const key of states) out[key] = (queue?.[key] || []).slice(-limit).map(summarizeTask);
      return text(out);
    }
    case "crewctl_engine_status": {
      const state = await api("GET", "/api/state");
      const status = state.status || {};
      return text({
        running: !!status.running,
        busy: !!status.busy,
        current: status.current || null,
        callsToday: status.callsToday ?? null,
        dailyCallBudget: status.budget ?? null,
        approvalMode: state.config?.approvalMode || null,
        operator: state.config?.operator?.cli || null,
        workingDir: state.workingDir || state.config?.workingDir || null,
        verifyCommands: state.config?.verify?.commands || [],
      });
    }
    case "crewctl_engine_control": {
      if (!engineControlAllowed()) {
        return toolError("Motor kontrolu kapali. Kullanici config.json icinde mcpServer.allowEngineControl degerini true yaparsa bu arac kullanilabilir.");
      }
      const action = String(input.action || "");
      if (!["start", "stop"].includes(action)) return toolError("action 'start' veya 'stop' olmali.");
      const status = await api("POST", "/api/engine", { action });
      return text({ action, running: !!status.running, busy: !!status.busy });
    }
    default:
      return toolError(`Bilinmeyen arac: ${name}`);
  }
}

function initializeResult(requested) {
  const protocolVersion = SUPPORTED_PROTOCOLS.includes(String(requested)) ? String(requested) : LATEST_PROTOCOL;
  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "crewctl", title: "CrewCtl", version: VERSION },
    instructions: INSTRUCTIONS,
  };
}

// Tek bir JSON-RPC mesajini isler. Bildirimlerde (id yok) null doner: yanit yazilmamalidir.
async function handleMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Gecersiz istek" } };
  }
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;
  const reply = (result) => (isNotification ? null : { jsonrpc: "2.0", id, result });
  const fail = (code, msg) => (isNotification ? null : { jsonrpc: "2.0", id, error: { code, message: msg } });

  try {
    switch (method) {
      // 2026-07-28 revizyonu el sikismayi kaldirdigi icin `server/discover` es-anlamli sunulur.
      case "initialize":
      case "server/discover":
        return reply(initializeResult(params?.protocolVersion));
      case "notifications/initialized":
      case "notifications/cancelled":
      case "notifications/progress":
        return null;
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: toolDefinitions() });
      case "tools/call": {
        const name = params?.name;
        if (!name || typeof name !== "string") return fail(-32602, "tools/call icin 'name' gerekli");
        try {
          return reply(await callTool(name, params.arguments));
        } catch (error) {
          // Panel kapali / HTTP hatasi: modelin gorup aktarabilecegi bir arac hatasi olarak don.
          return reply(toolError(error.message));
        }
      }
      // Bu sunucu yalnizca arac sunar; bazi istemciler yine de bu listeleri ister. Bos liste
      // dondurmek -32601'den daha uyumludur.
      case "resources/list":
        return reply({ resources: [] });
      case "resources/templates/list":
        return reply({ resourceTemplates: [] });
      case "prompts/list":
        return reply({ prompts: [] });
      default:
        return fail(-32601, `Desteklenmeyen metot: ${method}`);
    }
  } catch (error) {
    return fail(-32603, `Ic hata: ${error.message}`);
  }
}

// Satir-sonu ile ayrilmis JSON-RPC akisini tampondan ayiklar. Saf: test edilebilir olmasi icin
// transport'tan bagimsiz tutulur.
function splitFrames(buffer) {
  const parts = String(buffer).split("\n");
  return { frames: parts.slice(0, -1).map((line) => line.trim()).filter(Boolean), rest: parts[parts.length - 1] };
}

function start() {
  let buffer = "";
  const write = (response) => {
    if (!response) return;
    process.stdout.write(`${JSON.stringify(response)}\n`);
  };
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async (chunk) => {
    buffer += chunk;
    const { frames, rest } = splitFrames(buffer);
    buffer = rest;
    for (const frame of frames) {
      let message;
      try { message = JSON.parse(frame); }
      catch {
        write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON ayristirilamadi" } });
        continue;
      }
      write(await handleMessage(message));
    }
  });
  // Istemci stdin'i kapatinca temiz cikis (spec'in onerdigi kapatma sirasi).
  process.stdin.on("end", () => process.exit(0));
  process.stderr.write(`CrewCtl MCP sunucusu hazir (${baseUrl()} panelini kullanir).\n`);
}

module.exports = { start, handleMessage, callTool, toolDefinitions, splitFrames, initializeResult, baseUrl, SUPPORTED_PROTOCOLS, LATEST_PROTOCOL };
