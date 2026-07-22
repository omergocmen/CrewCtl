const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const store = require("./store");
const cliRegistry = require("./cli-registry");
const skillRegistry = require("./skill-registry");
const checkpoints = require("./checkpoints");

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

const DIFF_MAX_FILE_BYTES = 256 * 1024;
const DIFF_MAX_BASELINE_BYTES = 24 * 1024 * 1024;
const DIFF_MAX_BASELINE_FILES = 2000;
const DIFF_MAX_MATRIX_CELLS = 250000;
const DIFF_CONTEXT_LINES = 3;
const DIFF_MAX_RENDERED_LINES = 240;
const DIFF_MAX_EVENT_LINES = 1000;
const DIFF_MAX_SOURCE_LINES = 5000;

function isSensitiveDiffPath(file) {
  const normalized = String(file || "").replace(/\\/g, "/").toLowerCase();
  const base = path.posix.basename(normalized);
  return /^\.env(?:\.|$)/.test(base) || [".npmrc", ".pypirc", ".netrc"].includes(base) ||
    /(^|[._-])(secret|secrets|credential|credentials)([._-]|$)/.test(base) ||
    /\.(pem|key|p12|pfx)$/.test(base) || /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(base);
}

function readDiffText(file, maxBytes = DIFF_MAX_FILE_BYTES) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return { ok: false, status: "unavailable" };
    if (stat.size > maxBytes) return { ok: false, status: "too-large", size: stat.size };
    const buffer = fs.readFileSync(file);
    if (buffer.includes(0)) return { ok: false, status: "binary", size: stat.size };
    let controls = 0;
    for (const byte of buffer) {
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) controls++;
    }
    if (buffer.length && controls / buffer.length > 0.02) return { ok: false, status: "binary", size: stat.size };
    return { ok: true, text: buffer.toString("utf8"), size: stat.size };
  } catch {
    return { ok: false, status: "unavailable" };
  }
}

// Gorev basindaki metin iceriklerini sinirli bir butceyle saklar. Bu taban, Git deposu
// olmayan klasorlerde de modified/deleted dosyalar icin satir diff'i uretebilmemizi saglar.
function captureTextSnapshot(dir, snapshot, options = {}) {
  const maxBytes = Math.max(1024, Number(options.maxBytes) || DIFF_MAX_BASELINE_BYTES);
  const maxFiles = Math.max(1, Number(options.maxFiles) || DIFF_MAX_BASELINE_FILES);
  const maxFileBytes = Math.max(1024, Number(options.maxFileBytes) || DIFF_MAX_FILE_BYTES);
  const result = new Map();
  let bytes = 0, files = 0;
  for (const file of [...(snapshot?.keys?.() || [])].sort()) {
    if (isSensitiveDiffPath(file)) {
      result.set(file, { ok: false, status: "redacted" });
      continue;
    }
    if (files >= maxFiles || bytes >= maxBytes) {
      result.set(file, { ok: false, status: "baseline-limit" });
      continue;
    }
    const value = readDiffText(path.join(dir, file), maxFileBytes);
    if (value.ok && bytes + value.size > maxBytes) {
      result.set(file, { ok: false, status: "baseline-limit" });
      continue;
    }
    result.set(file, value);
    if (value.ok) { bytes += value.size; files++; }
  }
  return result;
}

function splitDiffLines(text) {
  const value = String(text || "").replace(/\r\n/g, "\n");
  if (!value) return [];
  const lines = value.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function lineOperations(beforeText, afterText) {
  const before = splitDiffLines(beforeText), after = splitDiffLines(afterText);
  const cells = before.length * after.length;
  let approximate = false;
  const operations = [];
  if (cells <= DIFF_MAX_MATRIX_CELLS) {
    const width = after.length + 1;
    const table = new Uint32Array((before.length + 1) * width);
    for (let i = before.length - 1; i >= 0; i--) {
      for (let j = after.length - 1; j >= 0; j--) {
        table[i * width + j] = before[i] === after[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < before.length || j < after.length) {
      if (i < before.length && j < after.length && before[i] === after[j]) {
        operations.push({ type: "context", text: before[i++] }); j++;
      } else if (i < before.length && (j >= after.length || table[(i + 1) * width + j] >= table[i * width + j + 1])) {
        operations.push({ type: "delete", text: before[i++] });
      } else {
        operations.push({ type: "add", text: after[j++] });
      }
    }
  } else {
    // Cok buyuk dosyalarda karesel matris kurma. Ortak bas/sonu koruyup degisen orta
    // bolumu tek hunk olarak goster; UI bu sonucu yaklasik olarak etiketler.
    approximate = true;
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
    let suffix = 0;
    while (suffix < before.length - prefix && suffix < after.length - prefix &&
      before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
    for (let i = 0; i < prefix; i++) operations.push({ type: "context", text: before[i] });
    for (let i = prefix; i < before.length - suffix; i++) operations.push({ type: "delete", text: before[i] });
    for (let i = prefix; i < after.length - suffix; i++) operations.push({ type: "add", text: after[i] });
    for (let i = suffix; i > 0; i--) operations.push({ type: "context", text: before[before.length - i] });
  }
  return { operations, approximate };
}

function buildLineDiff(beforeText, afterText, options = {}) {
  const context = Math.max(0, Number(options.context) || DIFF_CONTEXT_LINES);
  const maxLines = Math.max(20, Number(options.maxLines) || DIFF_MAX_RENDERED_LINES);
  const { operations, approximate } = lineOperations(beforeText, afterText);
  let oldNo = 1, newNo = 1;
  const annotated = operations.map((operation) => {
    const line = { ...operation, oldNumber: null, newNumber: null };
    if (operation.type !== "add") line.oldNumber = oldNo++;
    if (operation.type !== "delete") line.newNumber = newNo++;
    return line;
  });
  const additions = annotated.filter((line) => line.type === "add").length;
  const deletions = annotated.filter((line) => line.type === "delete").length;
  const ranges = [];
  for (let i = 0; i < annotated.length; i++) {
    if (annotated[i].type === "context") continue;
    const start = Math.max(0, i - context), end = Math.min(annotated.length, i + context + 1);
    const last = ranges[ranges.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else ranges.push({ start, end });
  }
  const hunks = [];
  let rendered = 0, truncated = false;
  for (const range of ranges) {
    if (rendered >= maxLines) { truncated = true; break; }
    const oldStart = 1 + annotated.slice(0, range.start).filter((line) => line.type !== "add").length;
    const newStart = 1 + annotated.slice(0, range.start).filter((line) => line.type !== "delete").length;
    const available = Math.max(0, maxLines - rendered);
    const selected = annotated.slice(range.start, Math.min(range.end, range.start + available));
    if (selected.length < range.end - range.start) truncated = true;
    hunks.push({
      oldStart,
      oldLines: selected.filter((line) => line.type !== "add").length,
      newStart,
      newLines: selected.filter((line) => line.type !== "delete").length,
      lines: selected.map((line) => ({ ...line, text: String(line.text).slice(0, 1000) })),
    });
    rendered += selected.length;
  }
  return { additions, deletions, hunks, truncated, approximate };
}

function describeFileDiff(root, file, action, baseline, options = {}) {
  const base = action === "created" ? { ok: true, text: "" } : baseline?.get(file);
  const current = action === "deleted" ? { ok: true, text: "" } :
    (isSensitiveDiffPath(file) ? { ok: false, status: "redacted" } : readDiffText(path.join(root, file)));
  const unavailable = !base?.ok ? base : (!current?.ok ? current : null);
  if (unavailable) return { path: file, action, additions: null, deletions: null, previewStatus: unavailable.status || "unavailable", hunks: [] };
  const lineCount = (text) => text ? (String(text).match(/\n/g) || []).length + 1 : 0;
  if (lineCount(base.text) > DIFF_MAX_SOURCE_LINES || lineCount(current.text) > DIFF_MAX_SOURCE_LINES) {
    return { path: file, action, additions: null, deletions: null, previewStatus: "too-many-lines", hunks: [] };
  }
  return { path: file, action, ...buildLineDiff(base.text, current.text, options) };
}

function clip(value, limit = 12000) {
  const text = String(value || "");
  return text.length <= limit ? text : `${text.slice(0, limit)}\n...[kesildi]`;
}

// Bas ve sonu koruyarak kirpar. Denetci raporlarinda VERDICT satiri metnin SONUNDadir;
// yalnizca bastan kirpmak operatorun karari gormemesine ve gereksiz yeniden inceleme
// turlarina yol acar.
function clipMiddle(value, limit = 12000) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  const head = Math.ceil(limit * 0.6);
  const tail = Math.max(1, limit - head);
  return `${text.slice(0, head)}\n...[orta kisim kesildi]...\n${text.slice(text.length - tail)}`;
}

function extractVerdict(text) {
  const matches = String(text || "").match(/VERDICT:\s*(PASS|FAIL)/gi);
  if (!matches || !matches.length) return null;
  return /PASS/i.test(matches[matches.length - 1]) ? "PASS" : "FAIL";
}

// Siniflandirilamayan hatada "gemini cikis kodu 1." gibi bilgisiz bir ilk satir yerine metnin
// icindeki GERCEK hata cumlesini bulur; kullaniciya gosterilen tek satir buysa anlamli olmali.
function meaningfulErrorLine(raw) {
  const all = String(raw).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  // Yigin izleri ve motorun kendi sardigi "<cli> cikis kodu N." satiri teshis tasimaz;
  // gercek neden hemen arkalarindaki satirdadir.
  const useful = all.filter((line) => !/^at\s|^node:internal|^[{}[\]]+$/.test(line) && !/cikis kodu/i.test(line));
  const signal = useful.find((line) => /error|hata|failed|failure|denied|invalid|exceeded|limit|quota|unable|cannot|must/i.test(line) && line.length > 20);
  return signal || useful[0] || all[0] || String(raw).trim();
}

// Ham CLI ciktisini kullaniciya "ne oldu + ne yapmali" seklinde anlamli bir teshise cevirir.
// SIRA ONEMLIDIR: spesifik desenler once gelmeli. Ornegin Gemini'nin "GEMINI_API_KEY ...
// not found" mesaji bir PATH/kurulum sorunu DEGILDIR; genis /not found/ deseni bu yuzden
// daraltildi ve kimlik kontrollerinin arkasina alindi.
function classifyCliError(error) {
  const raw = String(error?.message || error || "Bilinmeyen CLI hatasi");
  // Hatanin geldigi CLI biliniyorsa tavsiye ona gore uretilir (runCli her hatayi etiketler).
  const adapter = error?.adapter || "";
  const agentName = error?.agentName || "";
  const of = (code, summary, action) => ({ code, summary, action, agent: agentName, adapter, raw: clip(raw, 5000) });
  if (/requires a newer version|upgrade to the latest|model metadata.*not found|unsupported.*model|model.*unsupported/i.test(raw)) {
    return of("VERSION_INCOMPATIBLE", "CLI sürümü seçilen modeli desteklemiyor.", "CLI aracını güncelleyin veya desteklenen bir model seçin.");
  }
  if (/sessiz kaldi|cikti uretmedi|CLI_STALLED/i.test(raw)) {
    return of("CLI_STALLED", "CLI uzun süre yeni çıktı üretmeyince otomatik durduruldu.", "Önceki ilerleme kayıtları korundu; operatör bu oturumda farklı bir agent kullanacak.");
  }
  // "No provider available" 401 ile gelir ama OTURUM sorunu degildir: secili model hicbir
  // saglayiciya cozulemiyordur. Genel 401/403 kuralindan ONCE gelmeli, yoksa zaten girisli
  // kullaniciya bosuna "oturum acin" denir.
  if (/no provider available/i.test(raw)) {
    return of("PROVIDER_UNAVAILABLE", "Seçili model hiçbir yapılandırılmış sağlayıcıya çözümlenemedi (oturum sorunu değil).",
      "Ayarlar → Agent'lar bölümünde bu agent için açık bir model seçin. Model boşken OpenCode kendi son kullandığı modele düşer; o model erişilemezse görev bu hatayla durur.");
  }
  if (/API key not valid|API_KEY_INVALID|invalid[_ ]api[_ ]key|incorrect api key/i.test(raw)) {
    return of("AUTH_INVALID", "API anahtarı geçersiz veya reddedildi.", `Bu agent'ın API anahtarını yenileyin. ${cliRegistry.authHint(adapter)}`);
  }
  // Gemini CLI oturum acilmadiginda "Please set an Auth method" / "GEMINI_API_KEY environment
  // variable not found" yazar; her ikisi de kurulum degil OTURUM sorunudur.
  if (/set an auth method|GEMINI_API_KEY|GOOGLE_API_KEY|unauthorized|unauthenticated|authentication|login required|not logged in|please (run )?login|credentials? (not found|missing|expired)|PERMISSION_DENIED|\b40[13]\b/i.test(raw)) {
    return of("AUTH_REQUIRED", "CLI oturum açmamış; kimlik doğrulaması gerekiyor.", `${cliRegistry.authHint(adapter)} Sonra görevi tekrar deneyin.`);
  }
  // Kota (gunluk/aylik hak bitti) ile hiz siniri (kisa sureli) AYRI teshislerdir: ilki
  // beklemekle gecmez, ikincisi gecer. Kullanicinin sordugu "limitim mi bitti" ayrimi budur.
  if (/RESOURCE_EXHAUSTED|quota exceeded|exceeded your current quota|daily limit|günlük limit|gunluk limit|out of credits|insufficient (credit|balance|quota)|billing/i.test(raw)) {
    return of("QUOTA_EXCEEDED", "Sağlayıcı kotanız doldu (günlük/aylık hak veya bakiye bitti).", "Kota yenilenene kadar bu agent kullanılamaz; başka bir agent seçin, faturalandırmayı yükseltin veya API anahtarını kotası olan bir hesapla değiştirin.");
  }
  if (/rate.?limit|too many requests|\b429\b/i.test(raw)) {
    return of("RATE_LIMIT", "İstek hızı sınırına takıldı (kota bitmedi, çok sık istek gönderildi).", "Kısa bir süre bekleyip tekrar deneyin; operatör bu turda alternatif bir agent kullanabilir.");
  }
  if (/overloaded|\bUNAVAILABLE\b|\b(503|500)\b|internal error|try again later/i.test(raw)) {
    return of("MODEL_OVERLOADED", "Model sağlayıcısı geçici olarak aşırı yüklü ya da hata döndürdü.", "Sağlayıcı kaynaklı geçici bir sorun; birkaç dakika sonra tekrar deneyin.");
  }
  if (/location is not supported|not available in your country|region.*not supported/i.test(raw)) {
    return of("REGION_BLOCKED", "Model bulunduğunuz bölgede kullanıma kapalı.", "Desteklenen bir bölge/hesap kullanın veya başka bir sağlayıcının agent'ını seçin.");
  }
  if (/ConnectionRefused|Unable to connect|provider hatasi|provider error|ECONNREFUSED/i.test(raw)) {
    return of("PROVIDER_UNAVAILABLE", "Seçilen model sağlayıcısına bağlanılamadı veya model çözümlenemedi.",
      adapter === "opencode"
        ? "Ayarlar → Agent'lar bölümünde bu agent için açık bir model seçin (`opencode models` listesinden). Model seçili değilken OpenCode kendi son kullandığı modele düşer ve bu model erişilemez olabilir."
        : "Sağlayıcı bağlantısını kontrol edin veya başka bir model seçin.");
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|getaddrinfo|fetch failed|socket hang up|network (error|unreachable)|proxy/i.test(raw)) {
    return of("NETWORK_ERROR", "Ağ bağlantısı kurulamadı (DNS/proxy/internet).", "İnternet veya kurumsal proxy ayarlarınızı kontrol edip görevi tekrar çalıştırın.");
  }
  if (/not recognized as an internal|is not recognized|command not found|spawn .*ENOENT|\bENOENT\b|no such file or directory/i.test(raw)) {
    return of("CLI_NOT_FOUND", "CLI komutu bulunamadı; kurulu değil veya PATH üzerinde görünmüyor.", `${adapter && adapter !== "custom" ? `${adapter} CLI'sini kurun` : "CLI'yi kurun"} ve Ayarlar → Agent'lar bölümünde komut adını doğrulayın (kurulum komutları için Doctor ekranına bakın).`);
  }
  if (/timeout|timed out|zaman asim|zaman aşım/i.test(raw)) {
    return of("TIMEOUT", "CLI ayrılan süre içinde tamamlanamadı.", "Agent ayarlarından timeout değerini artırın veya görevi daha küçük parçalara bölün.");
  }
  return of("CLI_FAILED", clip(meaningfulErrorLine(raw), 500), "Ham CLI çıktısı teknik ayrıntılarda saklandı; sorun sürerse alternatif bir agent deneyin.");
}

const RECOVERABLE_CLI_ERRORS = new Set(["AUTH_INVALID", "AUTH_REQUIRED", "RATE_LIMIT", "QUOTA_EXCEEDED", "MODEL_OVERLOADED", "NETWORK_ERROR", "REGION_BLOCKED", "PROVIDER_UNAVAILABLE", "CLI_NOT_FOUND", "TIMEOUT", "CLI_STALLED", "CLI_FAILED", "VERSION_INCOMPATIBLE"]);
// Karantina = bu oturumda tekrar denemek anlamsiz. Kota/bolge kisiti beklemekle gecmez;
// hiz siniri (RATE_LIMIT) ve gecici saglayici hatasi (MODEL_OVERLOADED) gecer, karantinaya alinmaz.
const QUARANTINE_CLI_ERRORS = new Set(["AUTH_INVALID", "AUTH_REQUIRED", "QUOTA_EXCEEDED", "REGION_BLOCKED", "PROVIDER_UNAVAILABLE", "CLI_NOT_FOUND", "CLI_STALLED", "VERSION_INCOMPATIBLE"]);
// Birkac saniyede kendiliginden gecer; operatore geri tasiyip planlama turu harcamak yerine
// ayni agent ustel bekleme ile yeniden denenir.
const TRANSIENT_CLI_ERRORS = new Set(["RATE_LIMIT", "MODEL_OVERLOADED", "NETWORK_ERROR"]);
// Karantina suresi (sn). 0 = beklemekle duzelmez, kalici. Digerleri sure dolunca yeniden
// denenir (half-open); tekrar duserse sure katlanir (bkz. quarantineAgent).
const QUARANTINE_COOLDOWN_SECONDS = {
  AUTH_REQUIRED: 180,
  AUTH_INVALID: 180,
  PROVIDER_UNAVAILABLE: 180,
  CLI_STALLED: 300,
  QUOTA_EXCEEDED: 0,
  REGION_BLOCKED: 0,
  CLI_NOT_FOUND: 0,
  VERSION_INCOMPATIBLE: 0,
};

function resolveExecutionMode(task) {
  if (["fast", "balanced", "deep"].includes(task.executionMode)) return task.executionMode;
  const prompt = String(task.prompt || "");
  const complex = /(mimari|migration|refactor|guvenlik|güvenlik|deploy|production|veritabani|veritabanı|authentication|entegrasyon|çoklu|multi|kapsamli|kapsamlı)/i.test(prompt);
  // Not: "oyun/sayfa" gibi sifirdan build isleri BASIT sayilmaz — bunlar plan+uygula+incele
  // gerektiren gercek gorevlerdir; fast moda dusurulup ekip kullanilmadan gecilmemeli.
  // Not: "dosya" gibi genis kelimeler fast'a dusurmez; yorumdaki ilkeyle celisiyordu
  // (sifirdan build/dosya olusturma gercek bir gorevdir). Yalnizca acik "kucuk/hizli" sinyalleri.
  const simple = prompt.length < 350 && /(basit|ufak|küçük|kucuk|hizli|hızlı|simple|small|quick)/i.test(prompt);
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
    // Saglikli bir balanced gorev tek turda biter (uygulama + zincirli inceleme);
    // 3 tur, iki duzeltme/yeniden dogrulama turuna yer birakir.
    cfg.operator.maxRounds = Math.min(cfg.operator.maxRounds || 6, 3);
    cfg.operator.maxDelegationsPerRound = Math.min(cfg.operator.maxDelegationsPerRound || 8, 3);
    cfg.memoryCharBudget = Math.min(cfg.memoryCharBudget || 8000, 6000);
    cfg.teamContextCharBudget = Math.min(cfg.teamContextCharBudget || 30000, 24000);
  }
  return cfg;
}

const EMPTY_USAGE = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

function addUsage(target, extra) {
  const sum = { ...(target || EMPTY_USAGE) };
  for (const key of Object.keys(EMPTY_USAGE)) sum[key] = (sum[key] || 0) + (Number(extra?.[key]) || 0);
  return sum;
}

function usageTotal(usage) {
  return (Number(usage?.input) || 0) + (Number(usage?.output) || 0);
}

// OpenCode'un step_finish olayindaki token/maliyet alanlarini normalize eder. Alan adlari
// surumler arasinda degisebildigi icin eksik alan 0 sayilir; hicbir sayi yoksa null doner
// ki "veri yok" ile "sifir maliyet" ayirt edilebilsin.
function readStepUsage(event) {
  const tokens = event.part?.tokens || event.tokens;
  const cost = Number(event.part?.cost ?? event.cost);
  if (!tokens && !Number.isFinite(cost)) return null;
  return {
    input: Number(tokens?.input) || 0,
    output: Number(tokens?.output) || 0,
    reasoning: Number(tokens?.reasoning) || 0,
    cacheRead: Number(tokens?.cache?.read) || 0,
    cacheWrite: Number(tokens?.cache?.write) || 0,
    cost: Number.isFinite(cost) ? cost : 0,
  };
}

// DIKKAT: text/error sozlesmesi degismemeli — operatorun JSON protokolu bu metni okuyor.
// usage yalnizca EK bir alandir; cikarilamadiginda null kalir ve hicbir akisi etkilemez.
function normalizeCliOutput(agent, stdout) {
  if (agent.adapter !== "opencode" || !(agent.args || []).includes("json")) {
    return { text: String(stdout || "").trim(), error: "", usage: null };
  }
  const texts = [], errors = [];
  let usage = null;
  for (const line of String(stdout || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "text" && event.part?.text) texts.push(String(event.part.text));
      if (event.type === "error") errors.push(String(event.error?.message || event.error || "OpenCode model/provider hatasi"));
      if (event.type === "step_finish") {
        const step = readStepUsage(event);
        if (step) usage = addUsage(usage, step);
      }
    } catch {}
  }
  return { text: texts.join("\n").trim(), error: errors.join("\n").trim(), usage };
}

// Metindeki DENGELI suslu parantezli en dis JSON nesnesi adaylarini cikarir. String icindeki
// parantez/kacis karakterleri sayilmaz; boylece "final" metninde gecen bir { veya } eski
// "ilk-{ .. son-}" kestirmesini bozmaz. Ayrica model aciklama + nesne + ek aciklama yazdiginda
// (ya da birden fazla nesne dondurdugunde) her nesne ayri aday olur.
function jsonObjectCandidates(text) {
  const src = String(text);
  const found = [];
  const stack = [];
  let inString = false, escaped = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push(i);
    else if (ch === "}" && stack.length) {
      const start = stack.pop();
      if (!stack.length) found.push(src.slice(start, i + 1));
    }
  }
  return found;
}

// Model bazen JSON'u tek tirnak, sondaki virgul veya akilli tirnakla yazar. Kati parse
// basarisiz oldugunda son care olarak bu yaygin sapmalari onarip bir kez daha dener.
function repairJsonText(candidate) {
  return String(candidate)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

const PROTOCOL_KEYS = /"(status|assignments|summary|completionCriteria|final)"\s*:/;

function parseJson(text, label) {
  const raw = String(text);
  const candidates = [];
  for (const fence of raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) candidates.push(fence[1]);
  candidates.push(raw.trim());
  // Protokol anahtari iceren nesneler once denenir; ayni onem sirasinda SONDAKI nesne kazanir
  // (modeller once dusunce/aciklama, en sona nihai protokol nesnesini yazar).
  const objects = jsonObjectCandidates(raw).reverse();
  candidates.push(...objects.filter((o) => PROTOCOL_KEYS.test(o)), ...objects.filter((o) => !PROTOCOL_KEYS.test(o)));
  for (const candidate of candidates) {
    for (const attempt of [candidate, repairJsonText(candidate)]) {
      try {
        const parsed = JSON.parse(attempt);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch {}
    }
  }
  const error = new Error(`${label} gecerli JSON dondurmedi.`);
  error.rawText = raw;
  throw error;
}

// Protokol hatasinda operatorun ham metnini kullaniciya gosterilebilir bir cevaba cevirir.
// Yarim kalmis/kirik JSON parcalarini ve kod bloklarini atar; geriye anlamli duz metin
// kalmiyorsa null doner (o zaman normal hata akisi calisir).
function conversationalAnswer(error) {
  if (!/gecerli JSON dondurmedi/i.test(String(error?.message || ""))) return null;
  const raw = String(error.rawText || "");
  if (!raw.trim()) return null;
  const stripped = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\{[\s\S]*\}/g, " ")
    .replace(/[\s\S]*?^\s*\{[\s\S]*$/m, (match) => match.split("{")[0])
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Cok kisa artiklar (or. tek noktalama) cevap sayilmaz.
  return stripped.length >= 8 ? stripped : null;
}

function capabilitiesFor(agent) {
  // Rol dosyasi bir uzmanlik dayatiyorsa yetenekler DOGRUDAN rolden turer. Aksi halde
  // config'teki eski/genis capabilities listesi (or. planner'da "implementation") katalogda
  // allowedKinds ile celisir ve operatore yaniltici sinyal verirdi. Rol yoksa config'e duseriz.
  const role = String(agent.roleFile || "").toLowerCase();
  if (role.includes("executor")) return new Set(["implementation", "debugging", "testing"]);
  if (role.includes("review")) return new Set(["review", "testing", "analysis"]);
  if (role.includes("planner")) return new Set(["planning", "analysis"]);
  if (role.includes("operator")) return new Set(["planning", "delegation"]);
  return new Set(Array.isArray(agent.capabilities) ? agent.capabilities.map((x) => String(x).toLowerCase()) : []);
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

// Gorev metni gercek bir yapim/degisiklik isi mi? Operator, plan evresinde "bilgi sorusu
// kestirmesi" ile (delegasyon acmadan complete) yaniti dogrudan verebilir. Ama prompt acikca
// bir uygulama/olusturma istiyorsa bu kestirme kullaniciya HIC is uretmeden sahte basari doner
// (or. proje hafizasindaki gecmis teslimati "zaten yapildi" sanmak). Bu durumda kestirmeyi
// engelleyip yeniden planlama isteriz. inferAssignmentKind'in implement fiil kumesiyle uyumlu.
function taskRequiresDelegation(prompt) {
  return /\b(olustur|oluştur|yaz|uygula|kur|gelistir|geliştir|duzelt|düzelt|refactor|implement|build|create|edit|fix|generate|ekle|degistir|değiştir)\b/i.test(String(prompt || ""));
}

function roleAllowedKinds(agent) {
  const role = path.basename(String(agent?.roleFile || "")).toLowerCase();
  if (role.includes("executor")) return ["implement"];
  if (role.includes("review")) return ["review"];
  if (role.includes("planner")) return ["plan"];
  return null;
}

function supportsKind(agent, kind) {
  const roleKinds = roleAllowedKinds(agent);
  if (roleKinds) return roleKinds.includes(kind);
  const caps = capabilitiesFor(agent);
  const wanted = {
    implement: ["implementation", "coding", "development", "debugging"],
    review: ["review", "testing", "security", "analysis"],
    research: ["research", "web", "analysis"],
    plan: ["planning", "analysis", "architecture"],
  }[kind] || [];
  return wanted.some((cap) => caps.has(cap));
}

function agentUsable(agent) {
  return agent?.health?.status ? agent.health.status === "ready" : true;
}

function normalizeAssignments(value, cfg, operatorName, usedIds, taskText = "") {
  if (!Array.isArray(value)) throw new Error("Operator assignments dizisi dondurmedi.");
  const max = Math.max(1, cfg.operator?.maxDelegationsPerRound || 8);
  // Operator daha once kullanilan bir kimligi yinelerse gorevi oldurmek yerine kimligi
  // otomatik yeniden adlandiririz; saatlerce uretilmis teslimat bir ID cakismasi yuzunden
  // basarisiz sayilmamalidir. Ayni turdaki dependsOn referanslari da yeni ada tasinir.
  const renames = new Map();
  return value.slice(0, max).map((raw, index) => {
    let id = String(raw.id || `task-${Date.now()}-${index + 1}`).replace(/[^a-zA-Z0-9_.-]/g, "-");
    let renamedFrom;
    if (usedIds.has(id)) {
      let n = 2;
      while (usedIds.has(`${id}-r${n}`)) n++;
      renamedFrom = id;
      renames.set(id, `${id}-r${n}`);
      id = `${id}-r${n}`;
    }
    usedIds.add(id);
    const requestedAgent = String(raw.agent || "");
    if (!cfg.agents[requestedAgent]) throw new Error(`Operator tanimsiz agent secti: ${requestedAgent}`);
    if (cfg.agents[requestedAgent].enabled === false) throw new Error(`Operator devre disi agent secti: ${requestedAgent}`);
    if (!agentUsable(cfg.agents[requestedAgent])) throw new Error(`Operator kullanilamaz agent secti: ${requestedAgent} (${cfg.agents[requestedAgent].health?.label || "saglik testi basarisiz"})`);
    if (requestedAgent === operatorName) throw new Error("Operator kendisine uzman gorevi atayamaz.");
    const instruction = String(raw.instruction || raw.task || "").trim();
    if (!instruction) throw new Error(`${id} delegasyonunda instruction eksik.`);
    const kind = inferAssignmentKind(raw, instruction);
    // Beceriler kullanici-kapilidir: operator yalnizca cfg.skills.enabled icindekileri iliştirebilir.
    // Tanimsiz/etkin olmayan beceri sessizce dusurulur; asla gorevi olduren bir hata degildir.
    const hasExplicitSkills = Object.prototype.hasOwnProperty.call(raw, "skills");
    const autoMatchOn = cfg.skills?.autoMatch !== false;
    const requestedSkills = Array.isArray(raw.skills)
      ? raw.skills
      : (!hasExplicitSkills && autoMatchOn
          ? skillRegistry.suggest(cfg, `${taskText}\n${instruction}`, kind)
          : []);
    let skills = skillRegistry.resolveForAssignment(requestedSkills, cfg).map((skill) => skill.name);
    // Operator kodlama/planlama/review isinde beceri iliştirmeyi atlarsa (or. skills:[] dönerse),
    // kullanicinin etkin becerilerinden goreve GERCEKTEN uyanlari otomatik ekle. suggest() yalnizca
    // lexical eslesme oldugunda skill döner; alakasiz beceri asla iliştirilmez. Boylece "operator
    // becerileri kullanmiyor" durumu ortadan kalkar.
    if (!skills.length && autoMatchOn && ["implement", "plan", "review"].includes(kind)) {
      skills = skillRegistry.resolveForAssignment(
        skillRegistry.suggest(cfg, `${taskText}\n${instruction}`, kind), cfg
      ).map((skill) => skill.name);
    }
    let agent = requestedAgent;
    const unavailable = new Set(cfg.runtimeUnavailableAgents || []);
    if (unavailable.has(agent) || !supportsKind(cfg.agents[agent], kind)) {
      const compatible = Object.entries(cfg.agents).find(([name, candidate]) => name !== operatorName && candidate.enabled !== false && agentUsable(candidate) && !unavailable.has(name) && supportsKind(candidate, kind));
      if (compatible) agent = compatible[0];
      else if (unavailable.has(agent)) throw new Error(`Operator bu oturumda kullanilamaz agent secti: ${requestedAgent}`);
    }
    return {
      id, agent, kind, instruction, skills,
      renamedFrom,
      requestedAgent: agent === requestedAgent ? undefined : requestedAgent,
      routingReason: agent === requestedAgent ? undefined : `${requestedAgent} ${unavailable.has(requestedAgent) ? "bu oturumda kullanilamaz" : `${kind} yetenegine sahip degil`}; ${agent} secildi.`,
      dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn.map((dep) => renames.get(String(dep)) || String(dep)) : [],
    };
  });
}

function compatibleAgentForKind(cfg, operatorName, kind) {
  const unavailable = new Set(cfg.runtimeUnavailableAgents || []);
  return Object.entries(cfg.agents || {}).find(([name, agent]) =>
    name !== operatorName && agent.enabled !== false && agentUsable(agent) &&
    !unavailable.has(name) && supportsKind(agent, kind)
  )?.[0] || "";
}

// Devretme adaylari. Karantina filtresi cagirana birakilir: sureli oldugu icin karar canli
// durumdan (isQuarantined) okunmalidir.
function compatibleAgentsForKind(cfg, operatorName, kind) {
  return Object.entries(cfg.agents || {})
    .filter(([name, agent]) =>
      name !== operatorName && agent.enabled !== false && agentUsable(agent) && supportsKind(agent, kind))
    .map(([name]) => name);
}

function nextAssignmentId(base, usedIds) {
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) id = `${base}-${suffix++}`;
  usedIds.add(id);
  return id;
}

// Balanced bir uygulama gorevinde katalogda standart roller varsa ilk turu
// PLAN -> IMPLEMENT -> REVIEW olarak garanti eder. Operatorun bir rolu yanlislikla
// atlamasi, kullanicinin etkinlestirdigi uzmani sessizce devre disi birakamaz.
function ensureBalancedRoleChain(assignments, cfg, operatorName, task, usedIds) {
  if (task.executionMode !== "balanced" || !assignments.some((item) => item.kind === "implement")) return assignments;
  const chained = assignments.map((item) => ({ ...item, dependsOn: [...item.dependsOn] }));
  let plan = chained.find((item) => item.kind === "plan");
  if (!plan) {
    const planner = compatibleAgentForKind(cfg, operatorName, "plan");
    if (planner) {
      const instruction = "Kullanici hedefini ve mevcut calisma klasorunu salt okunur incele. Executor icin dosya kapsamini, uygulama siralamasini, riskleri ve dogrulama adimlarini iceren somut bir plan hazirla; dosyalari degistirme.";
      plan = {
        id: nextAssignmentId("balanced-plan", usedIds),
        agent: planner,
        kind: "plan",
        instruction,
        dependsOn: [],
        skills: cfg.skills?.autoMatch === false ? [] : skillRegistry.suggest(cfg, `${task.prompt || ""}\n${instruction}`, "plan"),
        routingReason: "Balanced rol zinciri: kullanilabilir planner ilk tura otomatik eklendi.",
      };
      chained.unshift(plan);
    }
  }
  const implementations = chained.filter((item) => item.kind === "implement");
  if (plan) {
    for (const implementation of implementations) {
      if (!implementation.dependsOn.includes(plan.id)) implementation.dependsOn.push(plan.id);
    }
  }
  let reviews = chained.filter((item) => item.kind === "review");
  if (!reviews.length) {
    const reviewer = compatibleAgentForKind(cfg, operatorName, "review");
    if (reviewer) {
      const instruction = "Tamamlanan uygulamayi kullanici hedefi ve kabul kriterlerine gore bagimsiz, salt okunur olarak denetle. Dosya ve test kanitlarini raporla; sonunda VERDICT: PASS veya VERDICT: FAIL yaz.";
      const review = {
        id: nextAssignmentId("balanced-review", usedIds),
        agent: reviewer,
        kind: "review",
        instruction,
        dependsOn: implementations.map((item) => item.id),
        skills: cfg.skills?.autoMatch === false ? [] : skillRegistry.suggest(cfg, `${task.prompt || ""}\n${instruction}`, "review"),
        routingReason: "Balanced rol zinciri: kullanilabilir reviewer ilk tura otomatik eklendi.",
      };
      chained.push(review);
      reviews = [review];
    }
  }
  for (const review of reviews) {
    // Operator belirli bir uygulamayi incelemeye bagladiysa bu kapsami genisletme;
    // ayni turdaki bagimsiz/yardimci bir implement hatasi ana incelemeyi bloke etmemeli.
    if (!review.dependsOn.length) {
      for (const implementation of implementations) review.dependsOn.push(implementation.id);
    }
  }
  const rank = { plan: 0, research: 1, implement: 2, review: 3 };
  return chained.map((item, index) => ({ item, index }))
    .sort((a, b) => (rank[a.item.kind] ?? 2) - (rank[b.item.kind] ?? 2) || a.index - b.index)
    .map(({ item }) => item);
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
    this._retrySleepers = new Set();
    // Canli kodlama akisi: gorev calisirken calisma klasorunu periyodik tarayan zamanlayici
    // ve son yayinlanan degisiklik imzasi (ayni durum tekrar tekrar yayinlanmasin diye).
    this._liveTimer = null;
    this._lastFileChangeKey = "";
    this._textBefore = null;
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
      usageToday: store.getDailyUsage(),
    };
  }

  // KULLANIM TELEMETRISI: gorev suresince agent bazinda token/maliyet toplar. Tamamen
  // additive ve hata toleranslidir — veri veremeyen CLI'lar (metin modunda calisan
  // codex/claude/gemini) icin sayaclar bos kalir, hicbir akis bundan etkilenmez.
  resetUsage() {
    this._usage = { total: { ...EMPTY_USAGE }, byAgent: {}, calls: 0, reportingCalls: 0 };
  }

  recordUsage(agentName, usage) {
    if (!this._usage) this.resetUsage();
    this._usage.total = addUsage(this._usage.total, usage);
    this._usage.byAgent[agentName] = addUsage(this._usage.byAgent[agentName], usage);
    this._usage.reportingCalls++;
    try { store.addDailyUsage(usage); } catch {}
  }

  // Gorev kapanisinda saklanacak sekil. Hicbir cagri veri vermediyse null doner ki arayuz
  // "0 token" gibi yaniltici bir sayi yerine "veri yok" gosterebilsin.
  usageSummary() {
    const usage = this._usage;
    if (!usage || !usage.reportingCalls) return null;
    return {
      total: usage.total,
      byAgent: usage.byAgent,
      calls: usage.calls,
      reportingCalls: usage.reportingCalls,
    };
  }

  publish(type, data, taskId = this.current?.id) {
    const event = { at: new Date().toISOString(), taskId: taskId || null, ...data, type };
    if (taskId) store.appendRunEvent(taskId, event);
    this.emit(type, event);
    return event;
  }

  // CANLI KODLAMA: gorev calisirken calisma klasorunu _snapBefore'a gore tarar ve olusan/
  // degisen/silinen dosyalari "filechange" olayiyla yayinlar; complete()'teki nihai diff'in
  // canli on-izlemesidir. Yalnizca durum degistiginde olay basar (ayni diff tekrarlanmaz).
  // Tamamen additive ve salt-okunurdur; hata verirse gorevi etkilemeden sessizce atlar.
  publishFileChanges(taskId = this.current?.id) {
    if (!taskId || !this._cwd || !this._snapBefore) return null;
    let changes, currentSnapshot;
    try {
      currentSnapshot = snapshotDir(this._cwd);
      changes = diffSnapshots(this._snapBefore, currentSnapshot);
    }
    catch { return null; }
    // Yalnizca dosya adlarini degil guncel stamp'i da imzaya kat. Ayni dosya gorev
    // sirasinda ikinci kez degistiginde yeni satir diff'i mutlaka yayinlanmalidir.
    const stampKey = [...changes.created, ...changes.modified]
      .map((file) => `${file}:${currentSnapshot.get(file) || ""}`).join("|");
    const key = `${stampKey}#${changes.deleted.join("|")}`;
    if (key === this._lastFileChangeKey) return null;
    const previouslyHadChanges = this._lastFileChangeKey !== "" && this._lastFileChangeKey !== "#";
    const changedFiles = [
      ...changes.created.map((file) => ({ file, action: "created" })),
      ...changes.modified.map((file) => ({ file, action: "modified" })),
      ...changes.deleted.map((file) => ({ file, action: "deleted" })),
    ];
    let remainingLines = DIFF_MAX_EVENT_LINES;
    const files = changedFiles.map(({ file, action }) => {
      if (remainingLines <= 0) return { path: file, action, additions: null, deletions: null, previewStatus: "event-limit", hunks: [] };
      const described = describeFileDiff(this._cwd, file, action, this._textBefore, { maxLines: Math.min(DIFF_MAX_RENDERED_LINES, remainingLines) });
      remainingLines -= (described.hunks || []).reduce((sum, hunk) => sum + (hunk.lines || []).length, 0);
      return described;
    });
    // Bos degisim setini (or. baslangictaki taban veya tum degisikliklerin geri alinmasi)
    // imzasini hatirla. Gorev basinda gurultu uretme; ancak daha once gorunen tum degisiklikler
    // geri alindiysa bos olayi yayinla ki dashboard bayat diff'i temizlesin.
    this._lastFileChangeKey = key;
    if (!files.length && !previouslyHadChanges) return null;
    return this.publish("filechange", {
      files,
      counts: { created: changes.created.length, modified: changes.modified.length, deleted: changes.deleted.length },
      lineCounts: {
        additions: files.reduce((sum, file) => sum + (Number(file.additions) || 0), 0),
        deletions: files.reduce((sum, file) => sum + (Number(file.deletions) || 0), 0),
        unavailable: files.filter((file) => file.additions == null || file.deletions == null).length,
      },
    }, taskId);
  }

  startLiveDiff(task) {
    this.stopLiveDiff();
    this._lastFileChangeKey = "";
    // liveDiff kesin olarak false yapilmadikca aciktir (mevcut davranisi degistirmeyen additive
    // ozellik). Tarama araligi config'ten ayarlanabilir; en dusuk 500ms ile sinirli.
    const cfg = this.cfg();
    if (cfg.liveDiff === false) { this._textBefore = null; return; }
    this._textBefore = captureTextSnapshot(this._cwd, this._snapBefore);
    const intervalMs = Math.max(500, Number(cfg.liveDiffIntervalMs) || 2500);
    this._liveTimer = setInterval(() => this.publishFileChanges(task.id), intervalMs);
    // unref: bekleyen bir tarama zamanlayicisi surecin kapanmasini asla engellemesin.
    if (this._liveTimer && typeof this._liveTimer.unref === "function") this._liveTimer.unref();
  }

  stopLiveDiff() {
    if (this._liveTimer) { clearInterval(this._liveTimer); this._liveTimer = null; }
  }

  setMode(mode) {
    const cfg = this.cfg();
    cfg.approvalMode = mode === "auto" ? "auto" : "ask";
    store.saveConfig(cfg);
    this.emit("status", this.status());
  }

  start() {
    if (this.running) return;
    if (!this.cfg().autonomousConsentAcceptedAt) {
      const error = new Error("Otonom CLI calistirma kosullari henuz kabul edilmedi. Dashboard'daki ilk kullanim uyarisini onaylayin.");
      error.code = "AUTONOMOUS_CONSENT_REQUIRED";
      throw error;
    }
    this.running = true;
    this.publish("log", { level: "info", msg: `Motor basladi. Mod=${this.cfg().approvalMode}` }, null);
    this.emit("status", this.status());
    this.loop();
  }

  stop() {
    this.running = false;
    this.wake();
    this.cancelRetrySleeps();
    this.stopLiveDiff();
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

  // sleepWake'ten AYRIDIR: o bos donguye aittir ve yeni gorev eklendiginde uyanir. Bu bekleme
  // yalnizca motor durdurulunca kesilmeli.
  sleepRetry(ms) {
    return new Promise((resolve) => {
      const sleeper = { resolve, timer: null };
      sleeper.timer = setTimeout(() => { this._retrySleepers.delete(sleeper); resolve(); }, ms);
      this._retrySleepers.add(sleeper);
    });
  }

  cancelRetrySleeps() {
    for (const sleeper of this._retrySleepers) {
      clearTimeout(sleeper.timer);
      sleeper.resolve();
    }
    this._retrySleepers.clear();
  }

  // Sureli karantina: kullanici oturum acar veya saglayici toparlanirsa agent kendiliginden
  // doner. Tekrar duserse ceza katlanir (en fazla 15 dk); suresi 0 olanlar kalici kalir.
  quarantineAgent(name, code, cfg) {
    const strikes = (this.unhealthyAgents.get(name)?.strikes || 0) + 1;
    const baseSeconds = QUARANTINE_COOLDOWN_SECONDS[code] ?? 120;
    const cooldownMs = baseSeconds > 0 ? Math.min(900, baseSeconds * strikes) * 1000 : 0;
    this.unhealthyAgents.set(name, {
      code, strikes, at: new Date().toISOString(),
      until: cooldownMs ? Date.now() + cooldownMs : 0,
    });
    if (cfg) cfg.runtimeUnavailableAgents = this.quarantinedAgents();
    this.publish("log", {
      level: "warn",
      msg: cooldownMs
        ? `${name} [${code}] nedeniyle ${Math.round(cooldownMs / 1000)} sn karantinada; sure dolunca otomatik yeniden denenecek.`
        : `${name} [${code}] nedeniyle bu oturumda kullanim disi (beklemekle duzelmez).`,
    });
  }

  isQuarantined(name) {
    const entry = this.unhealthyAgents.get(name);
    if (!entry) return false;
    if (entry.until && Date.now() >= entry.until) {
      this.unhealthyAgents.delete(name);
      this.publish("log", { level: "info", msg: `${name} karantina suresi doldu; yeniden deneme hakki verildi.` });
      return false;
    }
    return true;
  }

  quarantinedAgents() {
    return [...this.unhealthyAgents.keys()].filter((name) => this.isQuarantined(name));
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
        if (!this.salvage(task, error)) {
          const found = store.findTask(task.id);
          const failure = classifyCliError(error);
          task.status = "failed";
          task.error = error.message;
          // Siniflandirilmis teshis gorevle birlikte saklanir; arayuz "ne oldu / ne yapmali"
          // ayrimini ham hata metnini kirparak tahmin etmek yerine buradan okur.
          task.failure = failure;
          // Basarisiz gorev de para harcar; telemetri burada da saklanmali.
          task.usage = this.usageSummary();
          task.finishedAt = new Date().toISOString();
          if (found) store.moveTask(found.state, "failed", task);
          this.publish("log", { level: "error", msg: `HATA (${failure.code}): ${failure.summary}` }, task.id);
          this.publish("log", { level: "warn", msg: `Ne yapmali: ${failure.action}` }, task.id);
          if (task.kind === "operator-chat") {
            this.publish("result", { id: task.id, kind: "operator-chat", parentTaskId: task.parentTaskId, status: "failed", error: failure.summary, failure }, task.id);
          }
          this.notifyOutcome(task, "failed", { error: failure.summary, failureCode: failure.code, action: failure.action });
          this.emit("queue");
        }
      } finally {
        this.stopLiveDiff();
        this._textBefore = null;
        this.busy = false;
        this.current = null;
        this.activeChild = null;
        this.emit("status", this.status());
      }
    }
  }

  invokeAgent(agentName, prompt, cfg, meta = {}) {
    const configuredAgent = cfg.agents[agentName];
    const agent = configuredAgent && cliRegistry.effectiveAgent(configuredAgent, cfg);
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
    return new Promise((resolve, rawReject) => {
      // Her hata hangi CLI'dan geldigini tasir; tavsiye metni buna gore uretilir. Etiket yokken
      // opencode hatasinda kullaniciya gemini komutu oneriliyordu. Bkz. classifyCliError.
      const reject = (cause) => {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        if (!error.agentName) error.agentName = displayName;
        if (!error.adapter) error.adapter = agent.adapter || cliRegistry.adapterId(agent.cmd);
        rawReject(error);
      };
      const count = store.bumpCallCount();
      if (count > (cfg.dailyCallBudget || Number.MAX_SAFE_INTEGER)) {
        return reject(new Error(`Gunluk cagri butcesi asildi (${cfg.dailyCallBudget}).`));
      }
      if (!this._usage) this.resetUsage();
      this._usage.calls++;

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
      const command = cliRegistry.buildCommand(agent.cmd, rawArgs);
      const file = command.file;
      const args = command.args;
      const cwd = this._cwd || path.resolve(store.WORK_BASE, cfg.workingDir || ".");
      const started = Date.now();
      let stdout = "", stderr = "", settled = false, timedOut = false, silenceTimedOut = false;
      let timer, silenceTimer, progressTimer;
      const base = { callId, agent: displayName, stage: meta.stage || "agent", assignmentId: meta.assignmentId || null };

      this.current = { id: this.current?.id, stage: base.stage, agent: displayName, callId };
      this.emit("status", this.status());
      this.publish("activity", { ...base, kind: "process.started", cmd: agent.cmd, args: rawArgs, cwd });

      // Motor onceliklidir: canli CLI saglik/model probe'lari (or. codex app-server / codex exec)
      // ayni CLI'yi ayni anda calistirirsa codex ikinci exec oturumunu SIGTERM ile keser. Bu yuzden
      // operatör/agent kosumuna girmeden uctaki tum probe'lari sonlandiriyoruz.
      cliRegistry.abortActiveProbes();
      let child;
      try { child = spawn(file, args, { cwd, env: cliRegistry.agentEnvironment(agent), windowsHide: true, shell: command.shell, windowsVerbatimArguments: !!command.verbatim }); }
      catch (error) { return reject(error); }
      this.activeChild = child;
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      const timeoutMs = Math.max(10, agent.timeoutSeconds || cfg.agentTimeoutSeconds || 900) * 1000;
      const silenceTimeoutMs = Math.max(1, agent.silenceTimeoutSeconds || cfg.cliSilenceTimeoutSeconds || 300) * 1000;
      let lastOutputAt = Date.now();
      const terminateTree = () => {
        if (isWin && child.pid) {
          try { spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" }); } catch {}
        } else {
          try { child.kill("SIGKILL"); } catch {}
        }
      };
      const armSilenceTimer = () => {
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          if (settled) return;
          silenceTimedOut = true;
          this.publish("activity", { ...base, kind: "process.silence-timeout", silenceTimeoutMs, elapsedMs: Date.now() - started });
          terminateTree();
        }, silenceTimeoutMs);
      };
      armSilenceTimer();
      progressTimer = setInterval(() => {
        if (settled) return;
        this.publish("activity", { ...base, kind: "process.progress", elapsedMs: Date.now() - started, silentMs: Date.now() - lastOutputAt, silenceTimeoutMs });
      }, 15000);
      timer = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        this.publish("activity", { ...base, kind: "process.timeout", timeoutMs });
        terminateTree();
      }, timeoutMs);

      child.stdout.on("data", (data) => {
        const text = String(data);
        stdout += text;
        lastOutputAt = Date.now();
        armSilenceTimer();
        this.publish("activity", { ...base, kind: "stdout", text });
      });
      child.stderr.on("data", (data) => {
        const text = String(data);
        stderr += text;
        lastOutputAt = Date.now();
        armSilenceTimer();
        this.publish("activity", { ...base, kind: "stderr", text });
      });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(silenceTimer);
        clearInterval(progressTimer);
        this.activeChild = null;
        if (promptFile) { try { fs.rmSync(promptFile); } catch {} }
        this.publish("activity", { ...base, kind: "process.failed", error: error.message, durationMs: Date.now() - started });
        reject(error);
      });
      child.on("close", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(silenceTimer);
        clearInterval(progressTimer);
        this.activeChild = null;
        if (promptFile) { try { fs.rmSync(promptFile); } catch {} }
        const durationMs = Date.now() - started;
        // Cikti tek kez ayristirilir; hem kullanim telemetrisi hem metin ayni sonuctan okunur.
        const normalized = normalizeCliOutput(agent, stdout);
        if (normalized.usage) this.recordUsage(displayName, normalized.usage);
        this.publish("activity", { ...base, kind: "process.finished", exitCode: code, signal, durationMs, usage: normalized.usage, reason: silenceTimedOut ? "silence-timeout" : (timedOut ? "timeout" : null) });
        if (silenceTimedOut) return reject(new Error(`CLI_STALLED: ${agent.cmd} ${Math.round(silenceTimeoutMs / 1000)} saniye boyunca cikti uretmedi ve otomatik durduruldu.`));
        if (timedOut) return reject(new Error(`${agent.cmd} ${Math.round(timeoutMs / 1000)} saniyede zaman asimina ugradi${signal ? ` (signal=${signal})` : ""}. ${clip(stdout || stderr, 500)}`));
        // Teshis icin HER IKI akis da gerekir: bazi CLI'lar (Gemini dahil) kota/oturum hatasini
        // stdout'a, yigin izini stderr'e yazar. Yalnizca birini almak siniflandiriciyi kor birakiyordu.
        if (code !== 0) {
          const detail = [stderr, stdout].map((stream) => String(stream || "").trim()).filter(Boolean).join("\n");
          return reject(new Error(`${agent.cmd} cikis kodu ${code ?? "yok"}${signal ? ` (signal=${signal})` : ""}.\n${clip(detail, 2000)}`));
        }
        if (normalized.error) return reject(new Error(`OpenCode model/provider hatasi: ${clip(normalized.error, 500)}`));
        if (!normalized.text) return reject(new Error(`${agent.cmd} kullanilabilir cikti dondurmedi.${stderr ? ` ${clip(stderr, 300)}` : ""}`));
        resolve({ text: normalized.text, stderr: stderr.trim(), exitCode: code, durationMs, callId, usage: normalized.usage });
      });

      // Prompt argumanla/dosyayla verilse bile stdin MUTLAKA kapatilmali. OpenCode gibi CLI'lar
      // stdin TTY degilse borudan mesaj okur; EOF gelmezse model cagrisina hic gecmeden bloke olur.
      child.stdin.on("error", () => {});
      child.stdin.end(useStdin ? prompt : "");
    });
  }

  // Katalogda dosya yazabilen (implement) kullanilabilir bir uzman var mi? Operatorun kendisi ve
  // bu oturumda karantinaya alinan agentler haric. Tek executor (or. opencode) sessizlik nedeniyle
  // dustugunde takim fiilen dosya uretemez hale gelir; bu kontrol o durumu erken yakalar.
  hasUsableImplementAgent(cfg, operatorName) {
    return Object.entries(cfg.agents || {}).some(([name, agent]) =>
      name !== operatorName && agent.enabled !== false && agentUsable(agent)
      && !this.isQuarantined(name) && supportsKind(agent, "implement"));
  }

  // Sureli karantinadaki implement agentinin donusune kalan sure (ms). Geri donen yoksa ya da
  // bekleme makul siniri asiyorsa null; cagiran bunu "gorevi durdur" olarak yorumlar.
  msUntilImplementAgentReturns(cfg, operatorName, maxWaitMs = 5 * 60 * 1000) {
    const now = Date.now();
    const returns = Object.entries(cfg.agents || {})
      .filter(([name, agent]) => name !== operatorName && agent.enabled !== false
        && agentUsable(agent) && supportsKind(agent, "implement"))
      .map(([name]) => this.unhealthyAgents.get(name)?.until || 0)
      .filter((until) => until > now)
      .sort((a, b) => a - b);
    if (!returns.length) return null;
    const waitMs = returns[0] - now;
    return waitMs <= maxWaitMs ? waitMs : null;
  }

  agentCatalog(cfg, operatorName) {
    return Object.entries(cfg.agents)
      .filter(([name, agent]) => name !== operatorName && agent.enabled !== false && agentUsable(agent) && !this.isQuarantined(name))
      .map(([name, a]) => ({
        name,
        description: a.description || "",
        capabilities: [...capabilitiesFor(a)],
        allowedKinds: roleAllowedKinds(a) || ["implement", "review", "research", "plan"].filter((kind) => supportsKind(a, kind)),
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
        // Yalnizca gercek JSON protokol hatasi yeniden denenir. CLI'nin sessiz kalmasi,
        // auth/timeout veya proses hatasi ayni operatoru tekrar calistirmamalidir.
        if (!/gecerli JSON dondurmedi/i.test(String(error?.message || ""))) throw error;
        if (attempt >= retries) break;
        // Modelin ne dondurdugunu duzeltme istegine geri veriyoruz: "yalnizca JSON dondur"
        // talimatini tekrarlamak, hatayi goremeyen model icin cogu zaman ayni cevabi uretiyordu.
        correction = `\n\nONCEKI CEVAP PROTOKOLE UYMADI: ${error.message}\n` +
          `Senin onceki cevabin (kirpilmis):\n"""\n${clip(String(error.rawText || ""), 1200)}\n"""\n` +
          `Bu cevap gecerli bir JSON nesnesi degildi. Simdi SADECE tek bir JSON nesnesi dondur: ` +
          `ilk karakter { ve son karakter } olsun; oncesinde/sonrasinda selamlama, aciklama, dusunce, ` +
          `Markdown veya \`\`\` kod bloğu OLMASIN. Metin alanlarindaki cift tirnaklari \\" ile kacir.`;
        this.publish("log", { level: "warn", msg: `${label} protokol hatasi; operator yeniden deneniyor (${attempt + 2}/${retries + 1}).` });
      }
    }
    throw lastError;
  }

  // Insertion sirasi tamamlanma sirasidir; en son biten denetim en gecerli karardir.
  latestReview(state) {
    return Object.values(state.results || {}).reverse()
      .find((result) => result.kind === "review" && result.status === "completed" && result.verdict) || null;
  }

  // Operatorun karar evresine verilen takim kaydi. Ham state dokumu yerine sonuc odakli
  // bir ozet uretir; her sonucu kendi icinde ortadan kirpar ki en yeni denetim karari
  // (metnin sonundaki VERDICT satiri) butce asiminda kaybolmasin.
  teamDigest(state, cfg) {
    const results = Object.values(state.results || {});
    const budget = cfg.teamContextCharBudget || 30000;
    const perResult = Math.max(900, Math.floor(budget / Math.max(1, results.length)));
    const digest = {
      round: state.round,
      completionCriteria: state.criteria,
      results: results.map((result) => ({
        id: result.id, agent: result.agent, kind: result.kind, status: result.status,
        ...(result.verdict ? { verdict: result.verdict } : {}),
        result: clipMiddle(result.result, perResult),
      })),
    };
    return clipMiddle(JSON.stringify(digest, null, 2), budget);
  }

  operatorPrompt(task, cfg, memory, state, phase) {
    const operatorCli = task.operatorCli || cfg.operator?.cli;
    // Operatör rolü daima operator.md'dir; operatör bir CLI'dir, uzman agent'lar onun altında çalışır.
    const roleFile = cfg.operator?.roleFile || "roles/operator.md";
    const role = store.readRole(path.basename(roleFile));
    const catalog = this.agentCatalog(cfg, operatorCli);
    const skillContext = `${task.prompt}\n${phase === "review" ? Object.values(state.results || {}).map((result) => result.instruction || "").join("\n") : ""}`;
    const skillDiscovery = skillRegistry.discover(cfg, skillContext);
    const skillCatalog = skillDiscovery.catalog;
    const skillStats = skillDiscovery.stats;
    const enabledSkillNames = skillRegistry.enabledSkills(cfg).map((skill) => skill.name);
    // Beceri envanteri motor tarafindan uretilen OTORITER veridir. Operatore TAM etkin listeyi
    // (sayi + tum adlar) DAIMA veririz; boylece "kac beceri var" gibi sorular icin operatorun
    // kendi CLI'sinin dahili becerilerini veya bir alt agent'in iddiasini kullanmasi gerekmez.
    // Eslesen kisa liste yalnizca DELEGASYONA iliştirme icindir, envanterin tamami degildir.
    const skillSection = skillStats.enabled
      ? `## Beceriler (OTORITER kaynak)\nSistemde tam olarak ${skillStats.enabled} etkin beceri var: ${enabledSkillNames.join(", ")}.\n` +
        `Beceri sayisi/adi/varligi sorulursa YALNIZCA bu listeyi esas al ve dogrudan kendin cevapla; calistigin CLI'nin dahili becerilerini bu sisteme KATMA, bir alt agent farkli bir sayi soylerse bu listeyi degil onu YOK say.\n` +
        (skillCatalog.length
          ? `Bu goreve en ilgili ${skillCatalog.length} beceri (delegasyonun skills alanina yalnizca bunlardan uygun olanlari ekle):\n${JSON.stringify(skillCatalog, null, 2)}\n`
          : `Bu goreve gore taramada eslesme cikmadi; bu delegasyonlarda beceri iliştirme.\n`)
      : "";
    // Beceriler tamamen opsiyoneldir ve YALNIZCA kullanici etkinlestirdiginde katalogda gorunur.
    // Operator, assignment'a yalnizca bu kataloktaki adlari "skills" dizisinde iliştirebilir.
    const skillField = skillCatalog.length ? `, "skills":["beceri-adi"]` : "";
    const skillProtocol = skillCatalog.length
      ? ` BECERI: Kisa listedeki gercekten ilgili adlari skills dizisine ekle; ilgisiz veya liste disi ad kullanma, uygun yoksa alani bos birak.`
      : "";
    const protocol = phase === "plan"
      ? `Yalnizca gecerli JSON dondur. Gorev bir is/degisiklik/arastirma gerektiriyorsa delege et: {"summary":"yaklasim", "completionCriteria":["..."], "assignments":[{"id":"benzersiz-id", "agent":"catalog-name", "kind":"implement|review|research|plan", "instruction":"net gorev ve teslimat", "dependsOn":[]${skillField}}]} (en az bir assignment). ` +
        `Gorev yalnizca bir bilgi/soru VEYA bir selamlasma/sohbet mesaji ise (or. "merhaba", "nasilsin", "kac beceri var") ve yaniti dogrudan verebiliyorsan, HICBIR delegasyon acmadan: {"status":"complete", "final":"kullaniciya gosterilecek CEVABIN TAM METNI", "verification":"cevabin dayandigi kaynak"}. ` +
        `Selamlasmalarda bile cevabi JSON DISINA yazma: kullaniciya gosterilen tek alan "final"dir, nesnenin disindaki her metin atilir. Gercek is gerektiren gorevi bu kestirmeyle atlatma.${skillProtocol}`
      : `Yalnizca gecerli JSON dondur. Is tamamlanmadiysa {"status":"continue", "reason":"...", "assignments":[{"id":"...", "agent":"...", "kind":"implement|review|research|plan", "instruction":"...", "dependsOn":[]${skillField}}]}; tum kabul kriterleri karsilandiysa {"status":"complete", "final":"en fazla 5 kisa maddeyle ne yapildi", "verification":"tek satir dogrulama"}. Dosya listesini motor ekleyecek; final icinde uzun log veya ham agent cevabi tekrarlama. Continue icin en az bir yeni assignment zorunlu.${skillProtocol}\n` +
        `INCELEME DISIPLINI: Bagimsiz denetim VERDICT: PASS verdiyse ayni teslimat icin YENI review delegasyonu acma; complete dondur ve dusuk/orta onemdeki kalan notlari final metninde kalan risk olarak belirt. Ekipte bulunmayan dogrulama yetenegini (or. canli tarayici) tamamlanma sarti yapma; NOT RUN kalan dusuk riskli kontroller teslimati engellemez.`;
    const strategy = task.executionMode === "fast"
      ? "HIZLI MOD: Kucuk bir is. Tek bir implementation agenti kullan. Ayri planlama veya review delegasyonu acma; uzman raporu hedefi karsiliyorsa ilk degerlendirmede tamamla."
      : task.executionMode === "deep"
        ? "DERIN MOD: Isi uygun uzmanliklar arasinda dagit — planlama, uygulama, test ve bagimsiz inceleme icin AYRI ve dogru uzmanlari kullan."
        : "DENGELI MOD: Katalogda planner, executor ve reviewer varsa ucunu da ILK planda kullan. PLANLAMA -> UYGULAMA -> BAGIMSIZ INCELEME delegasyonlarini dependsOn ile ayni turda zincirle ve isi tek turda bitirmeyi hedefle. Ayni rolde birden fazla esdeger agent varsa yalnizca en uygun olani sec.";
    return `${role}\n\n---\n## Operator protokolu\n${protocol}\n` +
      // OpenCode gibi sohbet odakli CLI'lar varsayilan olarak once bir cumle yazip JSON'u
      // arkasina ekliyor; motor bunu ayiklayabilse de belirsizlik protokol hatasi uretiyordu.
      `## Cikti bicimi (KATI)\nCevabin TAMAMI tek bir JSON nesnesi olmali: ilk karakter { , son karakter } . ` +
      `Oncesinde/sonrasinda selamlama, aciklama, dusunce notu, Markdown basligi veya \`\`\` kod bloğu YAZMA. ` +
      `Kullaniciya iletmek istedigin her seyi ilgili JSON alanina ("final" veya "summary") koy; nesnenin disindaki metin kullaniciya ULASMAZ.\n` +
      `Yalnizca katalogdaki agent adlarini kullan. Her assignment kind degeri secilen agentin allowedKinds listesinde olmali. Kendine gorev atama. Ayni delegasyon id'sini tekrar kullanma.\n` +
      `Bir agent basarisiz veya kullanilamaz raporlandiysa ayni isi ona tekrar verme; katalogdaki alternatif bir uzmani sec.\n` +
      `AJAN SECIMI: Her alt gorevi, katalogdaki YETENEKLERE ve role gore o ise EN UYGUN uzmana ata; tum isi tek bir CLI'ye yigma. Isin ihtiyac duydugu her uzmanlik icin dogru uzmani sec (plan/tasarim -> planlama yetenegi; uygulama -> implementation; inceleme/dogrulama -> review/test; arastirma -> research/web). Ayni KIND icin birden fazla eşdeğer agent varsa YALNIZCA birini (en uygun ve en dusuk maliyetli) kullan; ayni isi iki eşdeğer agente verme. Farkli roller (or. bir uygulayici + bir inceleyici) FARKLI islerdir, tekrar sayilmaz.\n` +
      `## Calisma stratejisi\n${strategy}\n` +
      `## Agent katalogu\n${JSON.stringify(catalog, null, 2)}\n` +
      skillSection +
      `## Kullanici gorevi\n${task.prompt}\n` +
      `## Calisma klasoru\n${this._cwd}\n` +
      `## Proje hafizasi (gecmis baglam — gecmis teslimatlar mevcut gorevi TAMAMLANMIS SAYDIRMAZ; kanit olarak degil ipucu olarak kullan)\n${clip(memory, cfg.memoryCharBudget || 8000)}\n` +
      (phase === "review"
        ? `## Son bagimsiz denetim\n${(() => { const review = this.latestReview(state); return review ? `${review.id} (${review.agent}) → VERDICT: ${review.verdict}` : "Henuz tamamlanmis denetim yok."; })()}\n` +
          `## Takim calisma kaydi\n${this.teamDigest(state, cfg)}\n`
        : "");
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
      id: r.id, agent: r.agent, instruction: r.instruction, ...(r.verdict ? { verdict: r.verdict } : {}), result: clipMiddle(r.result, 5000),
    }));
    // Progressive disclosure: operatorun bu delegasyona sectigi becerilerin tam govdesini YIGMAYIZ;
    // yalnizca ad + kisa ozet + rehber dosya yolunu veririz. Uzman gercekten ihtiyac duyarsa dosyayi
    // kendisi okur. Operator hicbir beceri secmediyse (veya beceriler kapali ise) blok bostur.
    const skills = skillRegistry.resolveForAssignment(assignment.skills, cfg);
    const skillRefs = skillRegistry.toPromptRefs(skills, cfg.skills?.referenceCharBudget || 1200);
    return `${role}\n\n---\n## Takim agenti protokolu\n` +
      `Operator sana asagidaki isi devretti. ${instructionByKind[assignment.kind] || instructionByKind.implement} ` +
      `Planda olmayan riskli bir is gerekiyorsa yapma; BLOCKED olarak bildir. Yalnizca gercekten gozlemledigin veya dogruladigin sonuclari yaz.\n` +
      (skillRefs ? `## Uygulanacak beceriler\nBu is icin asagidaki beceri rehberleri secildi. Her satirda becerinin OZETI ve TAM rehberin DOSYA YOLU var. Ozet yeterliyse dogrudan uygula; daha fazla ayrinti gerekiyorsa ilgili dosyayi OKU ve prosedure uy. Ilgisiz bir sey varsa gormezden gel.\n${skillRefs}\n` : "") +
      `## Ana hedef\n${task.prompt}\n## Delegasyon\nID: ${assignment.id}\n${assignment.instruction}\n` +
      `## Onceki tamamlanan takim isleri\n${clip(JSON.stringify(completed, null, 2), cfg.teamContextCharBudget || 30000)}`;
  }

  // Iki kademeli kurtarma: (1) gecici hata -> ayni agent, ustel bekleme; (2) kalici hata ->
  // ayni turu yapabilen saglikli baska agente devret. Ikisi de tukenirse firlatir ve operator
  // yeniden planlar. Amac, saniyelik bir 429 icin tam bir operator turu harcamamak.
  async runAssignmentWithRecovery(task, cfg, assignment, state) {
    const retries = Math.max(0, cfg.resilience?.transientRetries ?? 2);
    const maxFailovers = Math.max(0, cfg.resilience?.maxFailoverAgents ?? 1);
    const baseDelayMs = Math.max(250, (cfg.resilience?.retryBaseSeconds ?? 3) * 1000);
    const tried = new Set();
    let agentName = assignment.agent;
    let failure = null;

    for (let failover = 0; ; failover++) {
      tried.add(agentName);
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await this.invokeAgent(
            agentName,
            this.specialistPrompt(task, cfg, { ...assignment, agent: agentName }, state),
            cfg,
            { stage: "delegate", assignmentId: assignment.id }
          );
          return { response, agent: agentName };
        } catch (error) {
          if (!this.running) throw error;
          failure = classifyCliError(error);
          if (!TRANSIENT_CLI_ERRORS.has(failure.code) || attempt >= retries) break;
          // Jitter: ayni anda dusen birden fazla delegasyon saglayiciya es zamanli geri donmesin.
          const waitMs = Math.min(30000, baseDelayMs * 2 ** attempt) + Math.floor(Math.random() * 750);
          this.publish("log", { level: "warn", msg: `${agentName} gecici hata verdi [${failure.code}]; ${Math.round(waitMs / 1000)} sn sonra yeniden deneniyor (${attempt + 2}/${retries + 1}).` }, task.id);
          this.publish("activity", { kind: "delegation.retry", assignmentId: assignment.id, agent: agentName, code: failure.code, attempt: attempt + 1, waitMs });
          await this.sleepRetry(waitMs);
          if (!this.running) throw error;
        }
      }
      if (QUARANTINE_CLI_ERRORS.has(failure.code)) this.quarantineAgent(agentName, failure.code, cfg);
      if (failover >= maxFailovers) break;
      const next = compatibleAgentsForKind(cfg, task.operatorCli, assignment.kind)
        .find((name) => !tried.has(name) && !this.isQuarantined(name));
      if (!next) break;
      this.publish("log", { level: "warn", msg: `${agentName} basarisiz [${failure.code}]; ayni is ${next} agentine devrediliyor (operator turu harcanmadan).` }, task.id);
      this.publish("activity", { kind: "delegation.failover", assignmentId: assignment.id, from: agentName, to: next, code: failure.code });
      agentName = next;
    }
    // Siniflandirici disaridaki catch'te ayni sonucu uretsin diye ham metinle firlatiyoruz.
    // CLI etiketi de tasinmali; yoksa oturum/kurulum tavsiyesi jenerige duser.
    const error = new Error(failure?.raw || "Delegasyon calistirilamadi.");
    error.agentName = failure?.agent || agentName;
    error.adapter = failure?.adapter || "";
    error.triedAgents = [...tried];
    throw error;
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
      if (assignment.renamedFrom) this.publish("log", { level: "warn", msg: `Operator delegasyon kimligini yineledi; ${assignment.renamedFrom} otomatik olarak ${assignment.id} yapildi.` }, task.id);
      this.publish("log", { level: "stage", msg: `DELEGE ${assignment.id} -> ${assignment.agent}` }, task.id);
      if (assignment.skills?.length) this.publish("log", { level: "info", msg: `Beceriler: ${assignment.skills.join(", ")}` }, task.id);
      try {
        const { response, agent: usedAgent } = await this.runAssignmentWithRecovery(task, cfg, assignment, state);
        const result = { ...assignment, agent: usedAgent, status: "completed", result: response.text, durationMs: response.durationMs, callId: response.callId };
        if (usedAgent !== assignment.agent) {
          result.failoverFrom = assignment.agent;
          this.publish("log", { level: "info", msg: `${assignment.id} devralan agent tarafindan tamamlandi: ${assignment.agent} -> ${usedAgent}.` }, task.id);
        }
        if (assignment.kind === "review") {
          result.verdict = extractVerdict(response.text);
          this.publish("log", { level: "info", msg: `Denetim ${assignment.id}: VERDICT ${result.verdict || "BELIRSIZ"}` }, task.id);
        }
        state.results[assignment.id] = result;
        const message = { from: usedAgent, to: task.operatorCli, messageType: "result", assignmentId: assignment.id, body: response.text, at: new Date().toISOString() };
        state.messages.push(message);
        this.publish("message", message, task.id);
      } catch (error) {
        // Karantina ve devretme runAssignmentWithRecovery'de tuketildi; buraya dusen gercekten
        // kurtarilamayandir.
        const failure = classifyCliError(error);
        const tried = error.triedAgents?.length ? error.triedAgents : [assignment.agent];
        state.results[assignment.id] = { ...assignment, status: "failed", result: failure.summary, error: failure, triedAgents: tried };
        const message = { from: tried[tried.length - 1], to: task.operatorCli, messageType: "failure", assignmentId: assignment.id, body: `${failure.summary}\n${failure.action}`, errorCode: failure.code, at: new Date().toISOString() };
        state.messages.push(message);
        this.publish("message", message, task.id);
        this.publish("log", { level: "warn", msg: `${tried.join(" > ")} kullanilamadi [${failure.code}]. Operator alternatif plan uretecek.` }, task.id);
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
    if (!baseCfg.autonomousConsentAcceptedAt) throw new Error("Otonom CLI calistirma kosullari kabul edilmeden gorev calistirilamaz.");
    if (task.kind === "operator-chat") return this.runChatTask(task, baseCfg);
    task.executionMode = resolveExecutionMode(task);
    const cfg = applyExecutionPolicy(baseCfg, task.executionMode);
    const operatorCli = task.operatorCli || cfg.operator?.cli;
    if (!operatorCli || !cliRegistry.operatorSpec(operatorCli, cfg)) throw new Error("Gecerli bir operator CLI secilmedi (claude/codex/gemini/opencode).");
    task.operatorCli = operatorCli;
    this.busy = true;
    this.current = { id: task.id, stage: "operator", agent: operatorCli };
    this._cwd = path.resolve(store.WORK_BASE, task.targetDir || cfg.workingDir || ".");
    this._snapBefore = snapshotDir(this._cwd);
    this.startLiveDiff(task);
    // Onay sonrasi devam eden gorevde sayaci sifirlamayiz; ilk girise ozgu.
    if (!task.approved || !this._usage) this.resetUsage();
    this.publish("log", { level: "task", msg: `GOREV ${task.id}: ${task.prompt}` }, task.id);
    // Otomatik surumleme: gorev CALISMADAN ONCE calisma klasorunun bir surumunu al ki ajan
    // mevcut kodu bozarsa bu gorev oncesine tek tikla donulebilsin. Yalnizca ilk girus'te
    // (approval sonrasi devam da ayni checkpoint'i korur). Basarisizsa gorevi asla oldurmez.
    if (baseCfg.versioning !== false && !task.checkpointId) {
      const cp = checkpoints.createCheckpoint(this._cwd, { taskId: task.id, label: task.prompt, kind: "pre-task", retention: baseCfg.versioningRetention });
      if (cp.ok) {
        task.checkpointId = cp.id;
        store.saveTask("pending", task);
        this.publish("log", { level: "info", msg: `Surum alindi (${cp.fileCount} dosya · ${cp.backend}); bu gorev oncesine geri donulebilir.` }, task.id);
      } else if (cp.skipped) {
        this.publish("log", { level: "warn", msg: `Surum alinamadi: ${cp.reason}` }, task.id);
      }
    }
    this.publish("log", { level: "info", msg: `Calisma modu: ${task.executionMode.toUpperCase()} · en fazla ${cfg.operator.maxRounds} tur / ${cfg.operator.maxDelegationsPerRound} delegasyon` }, task.id);
    this.emit("status", this.status());
    this.emit("queue");

    cfg.runtimeUnavailableAgents = this.quarantinedAgents();
    const memory = store.getMemory(cfg.memoryCharBudget);
    const state = task.teamState || { round: 0, plan: null, criteria: [], results: {}, messages: [], operatorDecisions: [], usedIds: [] };
    const usedIds = new Set(state.usedIds || []);

    let assignments;
    if (state.plan && task.approved) {
      assignments = normalizeAssignments(state.plan.assignments, cfg, operatorCli, usedIds, task.prompt);
      assignments = ensureBalancedRoleChain(assignments, cfg, operatorCli, task, usedIds);
      this.publish("log", { level: "info", msg: "Onaylanmis operator plani zorunlu rol zinciri korunarak devam ettiriliyor." }, task.id);
    } else {
      // Bilgi sorusu kestirmesi: operator, delege edilecek bir is olmadan yaniti dogrudan
      // verdiginde (or. "kac beceri var") tek turda tamamla. Boylece motorun otoriter verisi
      // bir alt agente aktarilirken kaybolmaz/carpitilmaz ve zorunlu assignment semasi bu
      // tur sorularda gorevi bosuna oldurmez. ANCAK gorev acikca bir yapim/degisiklik isiyse
      // kestirmeye izin verilmez: operator (cogunlukla proje hafizasindaki gecmis teslimati
      // "zaten yapildi" sanip) is uretmeden kapatmaya calisir. Once yeniden planlama isteriz;
      // israr ederse gorevi sahte basari yerine net bir hatayla dururuz.
      const requiresWork = taskRequiresDelegation(task.prompt);
      const shortcutRetries = requiresWork ? Math.max(1, cfg.operator?.protocolRetries ?? 1) : 0;
      let plan, shortcutAttempt = 0, planCorrection = "";
      while (true) {
        try {
          plan = await this.invokeOperatorJson(operatorCli, this.operatorPrompt(task, cfg, memory, state, "plan") + planCorrection, cfg, "operator-plan", "Operator plani");
        } catch (error) {
          // Sohbet kurtarma: gorev delegasyon gerektirmiyorsa (selamlasma, kisa soru) ve operator
          // protokol nesnesi yerine duz metinle cevap verdiyse, kullaniciyi "gecerli JSON
          // dondurmedi" hatasiyla karsilamak yanlistir — istenen sey zaten o metindi. Yalnizca
          // is gerektirmeyen gorevlerde ve elde gercek bir metin varken devreye girer.
          const prose = conversationalAnswer(error);
          if (requiresWork || !prose) throw error;
          this.publish("log", { level: "warn", msg: "Operator protokol nesnesi dondurmedi; gorev is gerektirmedigi icin duz metin cevabi teslimat sayildi." }, task.id);
          task.teamState = state;
          return this.complete(task, state, "done", prose, { verification: "Operatorun dogrudan yaniti (protokol nesnesi yerine duz metin)." });
        }
        const isShortcut = plan && String(plan.status).toLowerCase() === "complete" && !Array.isArray(plan.assignments);
        if (!isShortcut) break;
        if (!requiresWork) {
          if (!String(plan.final || "").trim()) throw new Error("Operator complete dedi fakat final sonucu bos birakti.");
          this.publish("log", { level: "info", msg: "Operator gorevi delegasyona gerek gormeden dogrudan yanitladi." }, task.id);
          task.teamState = state;
          return this.complete(task, state, "done", String(plan.final), plan);
        }
        if (shortcutAttempt++ >= shortcutRetries) {
          throw new Error("Operator bu yapim gorevini delege etmeden kapatmaya calisti. Proje hafizasindaki gecmis teslimatlar gorevi tamamlanmis saymaz; en az bir uygulama delegasyonu gerekir.");
        }
        this.publish("log", { level: "warn", msg: "Operator yapim gorevini delegasyonsuz kapatmaya calisti; hafiza gecmisi kanit sayilmaz, yeniden planlama isteniyor." }, task.id);
        planCorrection = "\n\nUYARI: Bu GERCEK bir yapim/degisiklik gorevidir. Proje hafizasindaki gecmis teslimatlar (or. onceki turlarda uretilmis dosyalar) bu gorevi TAMAMLANMIS SAYDIRMAZ; kullanici isin bu oturumda yeniden uretilip dogrulanmasini istiyor. status=complete DONME; en az bir 'implement' delegasyonu iceren bir plan uret.";
      }
      assignments = normalizeAssignments(plan.assignments, cfg, operatorCli, usedIds, task.prompt);
      assignments = ensureBalancedRoleChain(assignments, cfg, operatorCli, task, usedIds);
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
        this.stopLiveDiff();
        this._textBefore = null;
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
      // Uygulama agenti kalmadi guvenligi: Gorev acikca dosya olusturma/degistirme gerektiriyor
      // fakat katalogda 'implement' yapabilen kullanilabilir hicbir agent kalmadiysa (or. tek
      // executor opencode sessizlik nedeniyle karantinaya alindi) ve simdiye kadar tamamlanmis bir
      // uygulama isi da yoksa, HICBIR ek tur dosya uretemez. Operatoru planlayici/gap-analizi
      // dongusunde bosuna dondurup tur ve cagri butcesini yakmak yerine net, eyleme donuk bir
      // hatayla dur (kullanicinin gordugu "circle seklinde uzayip gitme" sorununu bu keser).
      if (taskRequiresDelegation(task.prompt)
          && !this.hasUsableImplementAgent(cfg, operatorCli)
          && !Object.values(state.results).some((result) => result.kind === "implement" && result.status === "completed")) {
        // Implement agenti yalnizca SURELI karantinadaysa gorevi oldurmek yerine bekleriz.
        // Kalici kisitlarda (kota bitti, CLI yok) null doner.
        const waitMs = this.msUntilImplementAgentReturns(cfg, operatorCli);
        let recovered = false;
        if (waitMs !== null) {
          this.publish("log", { level: "warn", msg: `Kullanilabilir implement agenti gecici olarak yok; karantina bitene kadar ${Math.ceil(waitMs / 1000)} sn bekleniyor.` }, task.id);
          await this.sleepRetry(waitMs + 250);
          // Bekleme sirasinda motor durdurulduysa gorevi "implement agenti yok" hatasiyla
          // basarisiz isaretlemek yaniltici olur; dongu kosulu zaten temiz cikisi saglar.
          if (!this.running) break;
          recovered = this.hasUsableImplementAgent(cfg, operatorCli);
          if (recovered) {
            cfg.runtimeUnavailableAgents = this.quarantinedAgents();
            this.publish("log", { level: "info", msg: "Implement agenti karantinadan dondu; gorev surduruluyor." }, task.id);
          }
        }
        const dead = this.quarantinedAgents();
        if (!recovered) throw new Error(
          "Bu gorev dosya olusturma/degistirme gerektiriyor fakat kullanilabilir bir uygulama (implement) agenti yok" +
          (dead.length ? ` (${dead.join(", ")} bu oturumda kullanim disi kaldi)` : "") +
          ". Ayarlar > Agent'lar'dan 'implementation' yetenekli bir agent (Codex/Claude/Gemini/OpenCode) ekleyip etkinlestirin veya opencode'un oturum/model durumunu kontrol edin, sonra gorevi tekrar calistirin."
        );
      }
      if (task.executionMode === "fast" && assignments.every((assignment) => state.results[assignment.id]?.status === "completed")) {
        const reports = assignments.map((assignment) => state.results[assignment.id].result).join("\n\n");
        this.publish("log", { level: "info", msg: "FAST mod: uzman teslimati basarili; ikinci operator degerlendirme cagrisi atlandi." }, task.id);
        return this.complete(task, state, "done", reports, {});
      }
      // PASS hizli yolu: turdaki tum delegasyonlar tamamlandi ve turun kendi bagimsiz
      // denetimi PASS verdiyse operatorun ikinci degerlendirme cagrisi bilgi eklemez,
      // yalnizca dakikalar kaybettirir. Bayat bir PASS'in yeni turu kapatmamasi icin
      // karar en guncel denetim olmalidir. operator.passFastPath=false ile kapatilabilir.
      const roundReview = assignments
        .map((assignment) => state.results[assignment.id])
        .filter((result) => result?.kind === "review" && result.status === "completed" && result.verdict)
        .pop();
      if (cfg.operator?.passFastPath !== false
        && assignments.every((assignment) => state.results[assignment.id]?.status === "completed")
        && roundReview?.verdict === "PASS"
        && roundReview === this.latestReview(state)) {
        this.publish("log", { level: "ok", msg: `Denetim ${roundReview.id} PASS verdi; operator degerlendirme cagrisi atlandi ve teslimat tamamlandi.` }, task.id);
        const completedWork = Object.values(state.results).filter((result) => result.status === "completed");
        const final = `Teslimat bagimsiz denetimden gecti (${roundReview.id} → VERDICT: PASS).\n` +
          completedWork.map((result) => `- ${result.id} (${result.agent}${result.verdict ? ` · VERDICT: ${result.verdict}` : ""})`).join("\n");
        return this.complete(task, state, "done", final, { verification: `${roundReview.agent} → VERDICT: PASS` });
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
      assignments = normalizeAssignments(decision.assignments, cfg, operatorCli, new Set(state.usedIds), task.prompt);
      // Inceleme dongusu valisi: bagimsiz denetim PASS verdiyse ve operator yalnizca yeni
      // inceleme turlari acmak istiyorsa dongu burada kesilir. Sonsuz review ping-pong'u
      // hem tur butcesini tuketiyor hem de basarili teslimati kullaniciya geciktiriyordu.
      const lastReview = this.latestReview(state);
      if (lastReview?.verdict === "PASS" && assignments.every((assignment) => assignment.kind === "review")) {
        this.publish("log", { level: "warn", msg: `Denetim ${lastReview.id} PASS verdi; yalnizca yeni inceleme iceren tur acilmadi ve teslimat tamamlandi.` }, task.id);
        const final = `Teslimat bagimsiz denetimden gecti (${lastReview.id} → VERDICT: PASS). ` +
          `Operatorun ek inceleme talebi tur butcesini korumak icin motor tarafindan sonlandirildi.` +
          (String(decision.reason || "").trim() ? `\nOperator notu: ${clip(decision.reason, 600)}` : "");
        return this.complete(task, state, "done", final, { verification: `${lastReview.agent} → VERDICT: PASS` });
      }
    }
    if (!this.running) throw new Error("Motor durduruldu; gorev tamamlanmadan kesildi.");
    return this.finishExhausted(task, state, recoveryRounds);
  }

  // Tur butcesi doldugunda tamamlanmis isi cope atmak yerine uyarili kismi teslimat yapar.
  // Kullanicinin gordugu sonuc "saatlerce bekledim ve hata aldim" degil, "teslimat hazir,
  // su riskler acik kaldi" olmalidir. Hic tamamlanan is yoksa eski davranis korunur.
  finishExhausted(task, state, recoveryRounds) {
    const completedWork = Object.values(state.results || {}).filter((result) => result.status === "completed");
    if (!completedWork.length) {
      throw new Error(`Operator ${state.round} tur sonunda gorevi tamamlayamadi${recoveryRounds ? ` (${recoveryRounds} CLI kurtarma turu kullanildi)` : ""}.`);
    }
    const lastReview = this.latestReview(state);
    const lastDecision = [...(state.operatorDecisions || [])].reverse().find((decision) => String(decision.status).toLowerCase() === "continue");
    const warnings = [
      `Tur butcesi doldu (${state.round} tur); operator complete karari veremeden teslimat kapatildi.`,
      ...(lastReview ? [`Son bagimsiz denetim: ${lastReview.id} → VERDICT: ${lastReview.verdict}.`] : []),
      ...(lastDecision && String(lastDecision.reason || "").trim() ? [`Operatorun acik biraktigi konu: ${clip(lastDecision.reason, 400)}`] : []),
    ];
    this.publish("log", { level: "warn", msg: `Tur butcesi doldu; tamamlanan is kismi teslimat olarak kapatiliyor (${completedWork.length} tamamlanmis delegasyon).` }, task.id);
    const final = `KISMI TESLIMAT: Tur butcesi doldugu icin gorev, tamamlanan isle kapatildi.\n` +
      completedWork.map((result) => `- ${result.id} (${result.agent}${result.verdict ? ` · VERDICT: ${result.verdict}` : ""})`).join("\n") +
      `\nAcik kalan konular teslimat uyarilarinda listelendi.`;
    return this.complete(task, state, "done", final, {
      warnings,
      verification: lastReview ? `${lastReview.agent} → VERDICT: ${lastReview.verdict}` : "",
    });
  }

  // Gorev beklenmedik bir hatayla kesildiginde (protokol hatasi, butce asimi vb.) somut is
  // uretilmisse gorevi failed yerine uyarili kismi teslimatla kapatir. Basarili olamazsa
  // false doner ve normal hata akisi calisir.
  salvage(task, error) {
    try {
      if (task.kind === "operator-chat") return false;
      if (!this._cwd || !this._snapBefore) return false;
      const state = task.teamState;
      const completedWork = Object.values(state?.results || {}).filter((result) => result.status === "completed");
      const changes = diffSnapshots(this._snapBefore, snapshotDir(this._cwd));
      const hasFileChanges = Boolean(changes.created.length || changes.modified.length || changes.deleted.length);
      const hasImplementation = completedWork.some((result) => result.kind === "implement");
      // Kurtarma kosulu: YA tamamlanmis bir uygulama delegasyonu var (ekip uretti) YA DA calisma
      // klasoru fiilen degisti. Ikincisi, operatorun kendisi standart JSON protokolune uymadan
      // isi dogrudan yaptigi durumu da kapsar (or. OpenCode operator rolunde JSON plan yerine
      // dosyalari kendisi degistirip duz metin doner). Hicbir is yoksa normal hata akisina birak.
      if (!hasFileChanges && !hasImplementation) return false;
      const failure = classifyCliError(error);
      const rescueState = state || { round: 0, plan: null, criteria: [], results: {}, messages: [], operatorDecisions: [], usedIds: [] };
      const operatorDirect = !completedWork.length && hasFileChanges;
      this.publish("log", { level: "warn", msg: `Gorev hatayla kesildi (${failure.summary}); ${operatorDirect ? "operatorun dogrudan yaptigi degisiklikler" : "tamamlanan is"} kismi teslimat olarak korunuyor.` }, task.id);
      const lastReview = this.latestReview(rescueState);
      const changedFiles = [...changes.created, ...changes.modified, ...changes.deleted];
      const final = operatorDirect
        ? `KISMI TESLIMAT: Operator (${task.operatorCli || "?"}) standart delegasyon protokolune uymadan isi dogrudan uyguladi; degisiklikler korundu.\n` +
          changedFiles.slice(0, 40).map((file) => `- ${file}`).join("\n")
        : `KISMI TESLIMAT: Gorev bir altyapi/protokol hatasiyla kesildi fakat tamamlanan is korundu.\n` +
          completedWork.map((result) => `- ${result.id} (${result.agent}${result.verdict ? ` · VERDICT: ${result.verdict}` : ""})`).join("\n");
      this.complete(task, rescueState, "done", final, {
        warnings: [
          `Gorev su hatayla kesildi: ${failure.summary}`,
          ...(operatorDirect ? [`Operator CLI (${task.operatorCli || "?"}) plan JSON'i yerine isi dogrudan yapti. Daha guvenilir orkestrasyon icin operator olarak JSON planlamaya uygun bir CLI (or. Codex veya Claude) secmeyi dusunun.`] : []),
          ...(lastReview ? [`Son bagimsiz denetim: ${lastReview.id} → VERDICT: ${lastReview.verdict}.`] : []),
        ],
        verification: lastReview ? `${lastReview.agent} → VERDICT: ${lastReview.verdict}` : "",
      });
      return true;
    } catch {
      return false;
    }
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
    this._cwd = path.resolve(store.WORK_BASE, parent.targetDir || cfg.workingDir || ".");
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
    // Son periyodik taramadan sonra yapilan degisiklikleri de replay kaydina ve dashboard'a
    // aktar; ardindan run --once yolunda da timer'in acik kalmamasini garanti et.
    this.publishFileChanges(task.id);
    this.stopLiveDiff();
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
    task.usage = this.usageSummary();
    const warnings = (Array.isArray(decision.warnings) ? decision.warnings : []).map(String).filter(Boolean);
    task.delivery = {
      summary: concise,
      files,
      location: this._cwd,
      verification,
      mode: task.executionMode,
      rounds: state.round,
      agents: [...new Set(Object.values(state.results).map((result) => result.agent))],
      ...(warnings.length ? { warnings } : {}),
    };
    task.teamState = state;
    const found = store.findTask(task.id);
    store.moveTask(found?.state || "pending", status, task);
    store.appendMemory(`${task.id} [${status}] ${task.prompt}`, `${task.summary}\nDosyalar: ${[...changes.created, ...changes.modified, ...changes.deleted].join(", ")}`);
    this.publish("result", { id: task.id, prompt: task.prompt, status, dir: this._cwd, changes, summary: task.summary, delivery: task.delivery, usage: task.usage, operator: task.operatorCli, rounds: state.round }, task.id);
    this.publish("log", { level: "ok", msg: `GOREV tamamlandi: ${task.id}` }, task.id);
    this.notifyOutcome(task, status, { summary: task.summary, rounds: state.round, fileCount: files.length, verification: task.delivery.verification });
    this.emit("queue");
    this._textBefore = null;
  }

  // Dis bildirim icin tek cikis noktasi: server.js bu event'i dinleyip (varsa) webhook'a POST atar.
  // Motoru HTTP'den bagimsiz tutar; bildirim basarisiz olsa bile gorev akisini etkilemez.
  notifyOutcome(task, status, extra = {}) {
    try {
      this.emit("notify", {
        status,
        id: task.id,
        prompt: task.prompt,
        operator: task.operatorCli || null,
        dir: this._cwd || task.targetDir || null,
        at: new Date().toISOString(),
        ...extra,
      });
    } catch {}
  }
}

module.exports = new Engine();
// Testlerin dis davranisla birlikte kritik saf kurallari da dogrudan dogrulayabilmesi icin.
module.exports._internals = {
  normalizeAssignments, ensureBalancedRoleChain, extractVerdict, clipMiddle, snapshotDir, diffSnapshots,
  captureTextSnapshot, buildLineDiff, describeFileDiff, isSensitiveDiffPath, taskRequiresDelegation,
  parseJson, conversationalAnswer, classifyCliError, RECOVERABLE_CLI_ERRORS, QUARANTINE_CLI_ERRORS,
  TRANSIENT_CLI_ERRORS, QUARANTINE_COOLDOWN_SECONDS, compatibleAgentsForKind,
  normalizeCliOutput, addUsage, usageTotal,
};
