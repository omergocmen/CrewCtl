// ICE DONUK MCP: ajanlara harici arac vermek (dis dunyaya baglanma).
// Disa donuk yon (CrewCtl'in KENDISININ MCP sunucusu olmasi) ayri bir modul: mcp-server.js.
//
// TASARIM (bu dosya SAF planlayicidir; dosya yazmaz, proses baslatmaz):
//
//   Katman 1  SERT KAPI    kinds ∩ agents ∩ kimlik bilgisi   → config'ten gelir, model ASLA
//                                                              genisletemez, yalnizca DARALTIR
//   Katman 2  MATERYALIZE  adapter'a ozgu arguman/ortam       → engine.runCli'de tek noktada
//
// ROL KAPISI (Anthropic'in kanonik cok-ajan modeliyle ortusur: "Tools, MCP servers, and context
// are not shared"; ornekte yalnizca researcher GitHub MCP'yi tanimlar, koordinatorun erisimi yok):
//   - OPERATOR: MCP YOK. Katalogda hangi aracin VAR OLDUGUNU bilir (yonlendirme icin) ama
//     kullanmaz. Gerekcesi uc katli: (a) operatorun cikisi kati JSON protokolu, arac kullanimi
//     bu kanali kirilganlastirir; (b) en cok cagrilan rol oldugu icin MCP boot maliyeti orada
//     carpilir; (c) mimari olarak gereksiz — zemin gerektiginde DELEGE eder, `plan`/`research`
//     turleri tam bunun icin var.
//   - executor (`implement`): tam erisim.  planner/reviewer/research: salt okunur sunucular.
//
// YETKI `readOnly` BAYRAGIYLA DEGIL, KIMLIK BILGISIYLE kurulur. Ayni backend'e iki giris yazilir
// (or. postgres-ro read-only DB kullanicisiyla + postgres-rw), cunku arac-seviyesinde kisitlama
// dort CLI'da esit degil: yalnizca claude `--allowedTools mcp__srv__tool` ile arac bazinda
// kesebiliyor, gemini yalnizca sunucu adi seviyesinde. Tasinabilir tek yaptirim birimi SUNUCU
// GIRISIDIR — ve "read-only DB kullanicisi vermek" modele "lutfen yazma" demekten kat kat guclu.
"use strict";

const path = require("path");

const KINDS = ["implement", "review", "research", "plan"];
// Yazma yetkili sunucu SALT OKUNUR turlere hicbir kosulda verilmez. Bu kural config'ten degil
// KODDAN gelir: kullanici yanlislikla yazma yetkili bir sunucuyu reviewer'a baglayamasin.
const READ_ONLY_KINDS = new Set(["review", "research", "plan"]);

const DEFAULTS = {
  enabled: false,
  mode: "strict",
  maxServersPerAssignment: 2,
  startupTimeoutMs: 15000,
};

function cleanList(value) {
  return Array.isArray(value) ? value.map((x) => String(x || "").trim()).filter(Boolean) : [];
}

// Tek sunucu girisinin normalizasyonu. Gecersiz giris SESSIZCE DUSURULUR (invalid alan
// birakmak, yarim yapilandirilmis bir sunucuyu ajana vermekten daha tehlikeli).
function normalizeServer(name, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const command = String(raw.command || "").trim();
  const url = String(raw.url || "").trim();
  // Yerel (stdio) sunucu icin command, uzak sunucu icin url gerekir.
  if (!command && !url) return null;
  const kinds = cleanList(raw.kinds).filter((k) => KINDS.includes(k));
  const env = {};
  if (raw.env && typeof raw.env === "object" && !Array.isArray(raw.env)) {
    for (const [key, value] of Object.entries(raw.env)) {
      if (typeof key === "string" && key.trim()) env[key.trim()] = String(value == null ? "" : value);
    }
  }
  return {
    name: String(name),
    ...(command ? { command } : {}),
    ...(url ? { url } : {}),
    args: cleanList(raw.args),
    env,
    enabled: raw.enabled !== false,
    // Bos kinds = tum turlere acik (ama write yetkilisi salt-okunur turlere kod kuraliyla
    // yine de verilmez; bkz. resolveForAssignment).
    kinds: kinds.length ? kinds : [...KINDS],
    // Bos agents veya ["*"] = tum uzmanlar.
    agents: cleanList(raw.agents),
    // write:true → yazma yetkili sunucu (salt-okunur turlere ASLA verilmez).
    write: raw.write === true,
    description: String(raw.description || "").trim(),
  };
}

// Saf ve idempotent: loadConfig sicak yoldur.
function normalizeConfig(cfg) {
  const src = cfg && typeof cfg === "object" && cfg.mcp && typeof cfg.mcp === "object" ? cfg.mcp : {};
  const servers = {};
  if (src.servers && typeof src.servers === "object" && !Array.isArray(src.servers)) {
    for (const [name, raw] of Object.entries(src.servers)) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(name))) continue; // MCP sunucu adi sade olmali
      const server = normalizeServer(name, raw);
      if (server) servers[name] = server;
    }
  }
  const max = Number(src.maxServersPerAssignment);
  const startup = Number(src.startupTimeoutMs);
  return {
    enabled: src.enabled === true,
    mode: src.mode === "inherit" ? "inherit" : "strict",
    servers,
    maxServersPerAssignment: Number.isInteger(max) && max >= 1 ? Math.min(8, max) : DEFAULTS.maxServersPerAssignment,
    startupTimeoutMs: Number.isFinite(startup) && startup >= 1000 ? startup : DEFAULTS.startupTimeoutMs,
    // OPT-IN, VARSAYILAN KAPALI: codex headless exec MCP'yi yalnizca sandbox-bypass ile calistirir
    // (codex bug'i; tek yol). true yapmak o ajan icin ajan hapsini DEVRE DISI birakir.
    codexUnsafeBypass: src.codexUnsafeBypass === true,
  };
}

function isEnabled(cfg) {
  const settings = normalizeConfig(cfg);
  return settings.enabled && Object.values(settings.servers).some((s) => s.enabled);
}

// Bir adapter MCP araclarini GERCEKTEN calistirabiliyor mu? "Yazilabilir stil" yetmez; CLI'nin
// runtime'i araci cagirmali. usable:false olanlar (codex/gemini) YALNIZCA kullanici acik bir
// opt-in verdiginde (unsafeBypass configKey) calisir hale gelir. Tek merkez: hem plan (enjeksiyon)
// hem catalogForAgent (operatore gosterim) bunu kullanir, boylece ikisi ASLA celismez.
function adapterUsable(descriptor, settings) {
  const d = descriptor;
  if (!d || !d.style) return false;
  if (d.usable !== false) return true;
  // Opt-in kacis: codex --dangerously-bypass-approvals-and-sandbox (belgelenmis codex exec bug'i
  // #16685/#24135 icin community cozumu). Kullanici bilincli olarak sandbox'i feda etmedikce KAPALI.
  if (d.unsafeBypass && settings && settings[d.unsafeBypass.configKey] === true) return true;
  return false;
}

// SERT KAPI. Bir delegasyona hangi sunucularin verilecegini belirler. Model bu kumeyi ASLA
// genisletemez; yalnizca daraltabilir (requested).
function resolveForAssignment(cfg, { kind, agentName, requested } = {}) {
  const settings = normalizeConfig(cfg);
  if (!settings.enabled) return [];
  // OPERATOR MCP ALMAZ: operator cagrilari kind tasimaz.
  if (!kind || !KINDS.includes(kind)) return [];
  const wanted = cleanList(requested);
  const chosen = [];
  for (const server of Object.values(settings.servers)) {
    if (!server.enabled) continue;
    if (!server.kinds.includes(kind)) continue;
    // KOD KURALI: yazma yetkili sunucu salt-okunur turlere verilmez.
    if (server.write && READ_ONLY_KINDS.has(kind)) continue;
    if (server.agents.length && !server.agents.includes("*") && !server.agents.includes(agentName)) continue;
    // Model bir liste verdiyse yalnizca DARALTIR.
    if (wanted.length && !wanted.includes(server.name)) continue;
    chosen.push(server);
  }
  return chosen.slice(0, settings.maxServersPerAssignment);
}

// Operatorun yonlendirme icin gorecegi kisa arac ozeti. Erisim YOK, yalnizca farkindalik:
// "bu gorev tarayicida dogrulama istiyor → tarayicisi olan agent'a ver".
// descriptor: agent'in adapter MCP tanimlayicisi. usable:false ise operatore ARAC GOSTERILMEZ,
// boylece operator MCP gerektiren isi bu CLI'ya yonlendirmez (senin log'undaki firecrawl->codex
// yanlis yonlendirmesinin kok cozumu).
function catalogForAgent(cfg, agentName, allowedKinds = KINDS, descriptor = null) {
  const settings = normalizeConfig(cfg);
  if (!settings.enabled) return [];
  // Operatore ARAC yalnizca gercekten kullanabilen adapter icin gosterilir (opt-in bypass dahil).
  // Boylece operator MCP isini kullanamayan CLI'ya yonlendirmez.
  if (descriptor && !adapterUsable(descriptor, settings)) return [];
  const names = new Set();
  for (const kind of allowedKinds) {
    for (const server of resolveForAssignment(cfg, { kind, agentName })) {
      names.add(server.description ? `${server.name} (${server.description})` : server.name);
    }
  }
  return [...names];
}

// Yer tutucular: es zamanli gorevlerde ayni sunucunun iki ornegi ayni durum dizinini
// (or. playwright --user-data-dir) paylasirsa profil kilidi catisir. cwd/callId/taskId ile
// her kosuma izole yol verilebilir.
function substitute(value, ctx) {
  return String(value)
    .replaceAll("{cwd}", ctx.cwd || "")
    .replaceAll("{callId}", ctx.callId || "")
    .replaceAll("{taskId}", ctx.taskId || "")
    .replaceAll("{tmp}", ctx.tmp || "")
    // configFile stili (codex) profil dosyasini CLI'nin kendi ev dizinine yazar.
    .replaceAll("{codexHome}", ctx.codexHome || "");
}

function applyContext(server, ctx) {
  const out = { ...server, args: server.args.map((a) => substitute(a, ctx)), env: {} };
  for (const [key, value] of Object.entries(server.env)) out.env[key] = substitute(value, ctx);
  if (out.command) out.command = substitute(out.command, ctx);
  if (out.url) out.url = substitute(out.url, ctx);
  return out;
}

// ---- SEKILLER (govde bicimleri) ----
// Ekosistemde 50 CLI olsa da govde sekli birkac tanedir; `mcpServers` fiili standarttir.
// Yeni bir CLI genellikle MEVCUT bir sekli kullanir, yani yeni kod gerekmez.
const SHAPES = {
  // Standart (claude ve MCP dokumantasyonlarinin verdigi bicim).
  mcpServers(servers) {
    const mcpServers = {};
    for (const s of servers) {
      mcpServers[s.name] = s.url
        ? { type: "http", url: s.url, ...(Object.keys(s.env).length ? { env: s.env } : {}) }
        : { command: s.command, args: s.args, ...(Object.keys(s.env).length ? { env: s.env } : {}) };
    }
    return { mcpServers };
  },
  // OpenCode: local/remote ayrimi ve komutun tek dizi olmasi.
  opencode(servers) {
    const out = {};
    for (const s of servers) {
      out[s.name] = s.url
        ? { type: "remote", url: s.url, enabled: true }
        : { type: "local", command: [s.command, ...s.args], enabled: true, ...(Object.keys(s.env).length ? { environment: s.env } : {}) };
    }
    return out;
  },
  // Codex config.toml: `[mcp_servers.<ad>]` bloklari. Sifir bagimlilik icin bu DAR sekle ozgu
  // kucuk bir TOML yazici (genel bir TOML kutuphanesi degil): yalnizca string, string dizisi ve
  // string->string inline tablo uretir; MCP sunucu tanimi bundan fazlasini gerektirmez.
  codexToml(servers) {
    const q = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const arr = (a) => `[${a.map(q).join(", ")}]`;
    const inlineTable = (obj) => `{ ${Object.entries(obj).map(([k, v]) => `${k} = ${q(v)}`).join(", ")} }`;
    const blocks = [];
    for (const s of servers) {
      const lines = [`[mcp_servers.${s.name}]`];
      if (s.url) lines.push(`url = ${q(s.url)}`);
      else {
        lines.push(`command = ${q(s.command)}`);
        if (s.args.length) lines.push(`args = ${arr(s.args)}`);
      }
      if (Object.keys(s.env).length) lines.push(`env = ${inlineTable(s.env)}`);
      // ZORUNLU (gercek codex ile olculdu, 2026-07-26): trust_level olmadan codex exec
      // (headless) modda MCP arac cagrisini "user cancelled MCP tool call" ile IPTAL eder;
      // approval_policy bunu ezmez. Kullanicinin calisan MCP sunuculari da "trusted" ile kayitli.
      lines.push(`trust_level = "trusted"`);
      lines.push(`enabled = true`);
      blocks.push(lines.join("\n"));
    }
    return blocks.join("\n\n") + "\n";
  },
};
// Geriye uyum icin adlandirilmis kisayollar (testler ve disaridan kullanim).
const claudeConfigBody = (servers) => SHAPES.mcpServers(servers);
const openCodeMcpBlock = (servers) => SHAPES.opencode(servers);

// ---- MATERYALIZASYON PLANI ----
// SAF: dosya yazmaz, proses baslatmaz. `files` icerigini engine yazar (Windows'ta JSON'u
// arguman olarak gecmek tirnaklari bozdugu icin daima dosyaya yazilir — sandbox `--settings`
// ile ayni desen).
//
// N x M SORUNUNA CEVAP: adapter'a ozgu bilgi BURADA DEGIL, `cli-registry.DEFINITIONS[<cli>].mcp`
// tanimlayicisinda durur ve buraya parametre olarak gelir. Yani yeni bir CLI eklemek = DEFINITIONS'a
// tek bir `mcp:` nesnesi yazmak; bu dosyada dallanma BUYUMEZ. Stiller:
//   flagFile  → config dosyasi yazilir, yolu bir bayrakla verilir            (claude)
//   envJson   → JSON config tutan bir ortam degiskenine anahtar eklenir      (opencode)
//   configFile→ CLI'nin okudugu sabit bir yola yazilir, bayrakla etkinlesir  (codex — Faz 2)
//   filterOnly→ CLI'da enjeksiyon yok; yalnizca var olanlari filtreler       (gemini — Faz 2)
function plan(cfg, agent, ctx = {}, descriptor = null) {
  const settings = normalizeConfig(cfg);
  const servers = resolveForAssignment(cfg, ctx).map((s) => applyContext(s, ctx));
  const empty = { servers: [], args: [], env: {}, envConfig: null, files: [], note: "" };
  if (!servers.length) return empty;
  const adapter = agent?.adapter || "";
  const d = descriptor;
  if (!d || !d.style) {
    return { ...empty, note: adapter ? `${adapter} icin MCP tanimi yok (cli-registry DEFINITIONS.${adapter}.mcp ekleyin)` : "" };
  }
  // KANITLANMIS GERCEK KAPISI. Bir stil "yazilabilir" olsa da CLI'nin RUNTIME'i araci gercekten
  // CAGIRMIYOR olabilir. Olculdu (2026-07-26): codex headless `exec` modu MCP tool cagrisini
  // "user cancelled MCP tool call" ile iptal ediyor (bes yapilandirma denendi: approval_policy
  // never/on-failure, trust_level, -c noktali-yol; hicbiri exec'te otomatik onaylatmadi). gemini
  // ise gorev-basi enjeksiyon sunmuyor (yalnizca onceden kayitli sunuculari filtreler) ve bu
  // makinede auth da yok. usable:false olan adapter sessizce YARIM CALISMAZ: enjeksiyon yapilmaz
  // ve ACIK bir not doner, boylece operator MCP isini calisan CLI'lara (claude/opencode) yonlendirir.
  if (!adapterUsable(d, settings)) {
    return { ...empty, note: d.usableNote || `${adapter}: bu CLI'da MCP arac cagrilari headless modda calismiyor.` };
  }
  // usable:false iken buraya gelindiyse kullanici opt-in bypass'i acmis demektir.
  const viaBypass = d.usable === false && d.unsafeBypass && settings[d.unsafeBypass.configKey] === true;
  const shape = SHAPES[d.shape] || SHAPES.mcpServers;

  if (d.style === "flagFile") {
    const args = [d.flag, "{MCP_FILE}"];
    // ZORUNLU (claude'da olculdu, 2026-07-25): headless modda MCP araclarini cagirmak ACIK izin
    // gerektirir. `--permission-mode acceptEdits` yalnizca dosya duzenlemeyi kapsar; izin bayragi
    // olmadan cagri "you haven't granted it yet" ile reddedilir ve onay verecek kimse olmadigi
    // icin ajan takilir. Tek arguman halinde birlestiriyoruz: degisken-sayili bicim sonraki
    // bayragi yutabilir.
    if (d.allowFlag) {
      args.push(d.allowFlag, servers.map((s) => `${d.allowPrefix || ""}${s.name}`).join(d.allowSeparator || ","));
    }
    // strict: YALNIZCA CrewCtl'in verdigi sunucular gorunur; kullanicinin global MCP'si kapanir.
    if (d.strictFlag && settings.mode === "strict") args.push(d.strictFlag);
    return {
      servers, args, env: {}, envConfig: null,
      files: [{ token: "{MCP_FILE}", suffix: d.suffix || ".mcp.json", content: JSON.stringify(shape(servers)) }],
      note: "",
    };
  }

  if (d.style === "envJson") {
    // Ortam degiskeni JSON config tutar; motor bunu MEVCUT icerikle birlestirir (opencode'un
    // otonom izin blogu korunmali). Birlestirme cli-registry.agentEnvironment'ta yapilir.
    return {
      servers, args: [], env: {},
      envConfig: { var: d.envVar, key: d.key, value: shape(servers) },
      files: [], note: "",
    };
  }

  if (d.style === "configFile") {
    // CLI, config'i KENDI belirledigi bir yoldan okur ve bir profil/bayrakla etkinlestirir
    // (codex: `-p <ad>` → `$CODEX_HOME/<ad>.config.toml`). flagFile'dan farki: dosya yolu
    // arguman DEGIL, CLI'nin ev dizinindedir; arguman profili ADIYLA secer. Es zamanli
    // gorevlerde ayni dosyayi ezmemek icin yol/profil {callId} ile izole edilir; dosya CLI'nin
    // dizinine yazildigi icin motor cleanup ETMELI (kullanicinin ~/.codex'ini kirletmesin).
    const absPath = substitute(d.pathTemplate || "", ctx);
    const args = (d.activateArgs || []).map((a) => substitute(a, ctx));
    // OPT-IN BYPASS: codex exec MCP cagrisini yalnizca bu bayrak calistirir (belgelenmis bug).
    // Bayrak sandbox'i da kapatir; motor rawArgs'tan cakisan -s/--sandbox'i cikarsin diye
    // stripSandbox isaretlenir ve YUKSEK SESLI uyari doner.
    let note = "";
    if (viaBypass) {
      args.push(d.unsafeBypass.flag);
      note = d.unsafeBypass.note || `${adapter}: MCP icin ajan hapsi (sandbox) DEVRE DISI. Ajan calisma klasoru disina da yazabilir; worktree izolasyonu onerilir.`;
      return {
        servers, args, env: {}, envConfig: null, stripSandbox: true,
        files: [{ absPath, content: shape(servers), cleanup: d.cleanup !== false }],
        note,
      };
    }
    // Bypass'siz configFile (gelecekteki usable:true bir CLI icin): profil BASE config'in
    // USTUNE katmanlanir; kullanicinin global MCP'si de acik kalir (codex'te strict tam saglanamaz).
    note = settings.mode === "strict"
      ? `${adapter}: profil BASE config uzerine katmanlanir; kullanicinin global MCP sunuculari da acik kalir (strict tam saglanamaz).`
      : "";
    return {
      servers, args, env: {}, envConfig: null,
      files: [{ absPath, content: shape(servers), cleanup: d.cleanup !== false }],
      note,
    };
  }

  if (d.style === "filterOnly") {
    // CLI'da gorev-basi ENJEKSIYON YOK (gemini). Sunucular kullanici tarafindan onceden
    // `gemini mcp add` ile kayitli olmali; CrewCtl yalnizca hangilerinin ACIK olacagini
    // FILTRELEYEBILIR. Isimler kullanicinin kaydettikleriyle ESLESMELI.
    const args = servers.flatMap((s) => [d.flag, s.name]); // yargs dizisi: bayragi tekrarla
    return {
      servers, args, env: {}, envConfig: null, files: [],
      note: `${adapter}: sunucular gorev-basi enjekte EDILEMEZ; yalnizca filtrelendi. Bu sunucular `
        + `kullanici tarafindan onceden kaydedilmis olmali (or. \`gemini mcp add ${servers[0]?.name || "<ad>"} ...\`), `
        + `aksi halde filtre bos kalir.`,
    };
  }

  return { ...empty, note: `${adapter}: '${d.style}' MCP stili henuz uygulanmadi` };
}

module.exports = {
  KINDS, READ_ONLY_KINDS, DEFAULTS, SHAPES,
  normalizeServer, normalizeConfig, isEnabled, adapterUsable,
  resolveForAssignment, catalogForAgent,
  substitute, applyContext, claudeConfigBody, openCodeMcpBlock, plan,
};
