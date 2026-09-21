const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
const flowHtml = fs.readFileSync(path.join(__dirname, "..", "web", "flow.html"), "utf8");
const codeHtml = fs.readFileSync(path.join(__dirname, "..", "web", "code.html"), "utf8");
const boardHtml = fs.readFileSync(path.join(__dirname, "..", "web", "board.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
assert.ok(scripts.length, "inline UI script bulunamadi");
for (const script of scripts) new Function(script);
// Canli kodlama ayri sayfaya tasindi; inline scriptinin sozdizimi gecerli olmali.
const codeScripts = [...codeHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
assert.ok(codeScripts.length, "code.html inline script bulunamadi");
for (const script of codeScripts) new Function(script);
// Kanban Pano ayri sayfa: inline scriptinin sozdizimi gecerli olmali.
const boardScripts = [...boardHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
assert.ok(boardScripts.length, "board.html inline script bulunamadi");
for (const script of boardScripts) new Function(script);
// Pano yasam-dongusu sutunlarini icermeli ve queue+status+schedules olaylarini dinlemeli.
// Onay sutunu kaldirildi (yalnizca auto mod kullaniliyor).
for (const id of ["col-pending", "col-running", "col-done", "col-failed"]) {
  assert.match(boardHtml, new RegExp(`id="${id}"`), `board.html ${id} sutununu icermeli`);
}
assert.doesNotMatch(boardHtml, /id="col-approval"/, "board.html Onay sutununu icermemeli");
assert.match(boardHtml, /\['status','queue','schedules'\]/, "board.html status/queue/schedules olaylarini dinlemeli");
assert.match(boardHtml, /function renderBoard\(/, "board.html pano render fonksiyonu icermeli");
assert.match(boardHtml, /schedStrip/, "board.html yaklasan zamanlanmis gorev seridini icermeli");
// Dashboard'dan Pano'ya gecis butonu ve zamanlama sekmesi bulunmali.
assert.match(html, /board\.html/, "ana ekranda Pano sayfasina gecis olmali");
// Zamanlama gorev kismindadir (composer), ayarlar sekmesinde degil.
assert.doesNotMatch(html, /data-tab="schedules"/, "zamanlama artik ayri ayarlar sekmesinde olmamali");
assert.match(html, /id="schedFields"/, "gorev composer'inda zamanlama alani olmali");
assert.match(html, /id="scheduleList"/, "gorev kisminda zamanlanmis gorev listesi olmali");
assert.match(html, /function renderScheduleList\(/, "zamanlanmis gorev listesi renderer icermeli");
assert.match(html, /function addScheduleFromComposer\(/, "composer'dan zamanlama olusturma islevi olmali");
// Hemen/Zamanla mod anahtari: dolu zamanlama alani yanlislikla hemen calistirilmamali.
assert.match(html, /function setComposerMode\(/, "composer Hemen/Zamanla mod anahtari olmali");
assert.match(html, /function composerSubmit\(/, "ana buton moda gore ekle/zamanla ayirmali");
assert.match(html, /function csTypeChanged\(/, "tetikleyici turune gore secim alanlari degismeli");
assert.match(html, /'\/api\/schedules'/, "zamanlama CRUD /api/schedules ucunu cagirmali");
// Saat manuel yazi yerine secim (dropdown) ile alinmali.
assert.match(html, /function hourOptions\(/, "saat secimi dropdown ile sunulmali");
assert.match(html, /function minuteOptions\(/, "dakika secimi dropdown ile sunulmali");
// Ayri canli kodlama sayfasi filechange olayini dinlemeli ve satir-diff'i gostermeli.
assert.match(codeHtml, /\['status','filechange','activity','log','result'\]/, "code.html filechange olayini dinlemeli");
assert.match(codeHtml, /function renderDiffFile\(/, "code.html satir-diff render etmeli");
assert.match(codeHtml, /id="files"/, "code.html dosya diff listesi icermeli");
assert.match(codeHtml, /id="nowText"/, "code.html 'su an ne oluyor' satiri icermeli");
assert.match(codeHtml, /id="revertBtn"/, "canli kod sayfasi 'onceki surume don' butonu icermeli");
assert.match(codeHtml, /function revertVersion\(/, "canli kod geri-don islevini icermeli");
assert.match(codeHtml, /\/restore/, "canli kod geri-don restore ucunu cagirmali");
assert.match(codeHtml, /function resolveBootTaskId\(/, "code.html acilista gosterilecek gorevi ortak resolver ile secmeli");
assert.match(codeHtml, /get\('task'\)\|\|state\?\.status\?\.current\?\.id/, "task query yoksa aktif gorevin id'si kullanilmali");
const resolverSource = codeScripts[0].match(/function resolveBootTaskId\(state,search=location\.search\)\{[^}]+\}/)?.[0];
assert.ok(resolverSource, "canli kod gorev resolver'i test icin bulunmali");
const resolveBootTaskId = new Function(`${resolverSource}; return resolveBootTaskId`)();
assert.equal(resolveBootTaskId({ status: { current: { id: "active-task" } } }, ""), "active-task", "query yoksa aktif gorev secilmeli");
assert.equal(resolveBootTaskId({ status: { current: { id: "active-task" } } }, "?task=chosen-task"), "chosen-task", "acik task query aktif gorevden oncelikli olmali");
assert.equal(resolveBootTaskId({ queue: { done: [{ id: "t-01" }, { id: "t-02" }] } }, ""), "t-02", "aktif gorev yoksa en son tamamlanan gorev otomatik secilmeli");
assert.match(html, /code\.html\?task=/, "tamamlanan gorev kartinda 'Kodu gor' baglantisi olmali");
assert.match(codeHtml, /bufferedEvents\.push\(\{type,data\}\)/, "canli kod replay sirasindaki SSE olaylarini tamponlamali");
assert.match(codeHtml, /const seen=new Set\(replayed\.map/, "canli kod gecmis ve tampon olaylarini tekillestirmeli");
// Ana ekranda canli kodlama sayfasina gecis butonu olmali; kart ana ekrandan cikarilmis olmali.
assert.match(html, /code\.html/, "ana ekranda Canli Kod sayfasina gecis olmali");
assert.doesNotMatch(html, /id="liveFiles"/, "canli kodlama karti ana ekrandan cikarilmali");
// Ekip Akisi artik gercek 3B WebGL (Three.js) sahnesi: kod bir ES modulunde.
// Import satirlarini ayiklayip sozdizimi gecerliligini dogrula (new Function bir
// modul import ifadesini parse edemez, ama geri kalan mantik duz fonksiyon govdesidir).
const flowModule = (flowHtml.match(/<script type="module">([\s\S]*?)<\/script>/) || [])[1];
assert.ok(flowModule, "flow 3B modul script bulunamadi");
new Function(flowModule.replace(/^\s*import[^\n]*$/gm, ""));

const requiredIds = [
  "prompt", "taskOperator", "executionMode", "targetDir", "pending", "approval", "done", "failed",
  "teamMap", "agentGrid", "feed", "startBtn", "stopBtn", "pendingCount", "doneCount", "failedCount", "historyCount",
];
for (const id of requiredIds) {
  const count = (html.match(new RegExp(`id=["']${id}["']`, "g")) || []).length;
  assert.equal(count, 1, `${id} bir kez bulunmali`);
}

assert.match(html, /<details class="advanced">/, "ileri gorev ayarlari katlanabilir olmali");
assert.match(html, /<details class="card live-details">/, "ham terminal ciktisi ikincil katmanda olmali");
assert.match(html, /class="node-orb"/, "ekip dugumleri profesyonel node gorunumunu kullanmali");
assert.match(html, /class="agent-avatar"/, "agent panelleri rol kimligi gostermeli");
assert.match(html, /class="agent-state-text"/, "agent durum metni canli guncellenebilir olmali");
assert.match(flowHtml, /\.agent-card:before/, "agent filosu premium durum vurgusunu kullanmali");
assert.match(flowHtml, /id="scene"/, "ekip akisi gercek 3B WebGL sahnesi (canvas) kullanmali");
assert.match(flowHtml, /class="agent-panel"/, "3B ajana tiklayinca detay paneli acilmali");
assert.match(flowHtml, /import \* as THREE from 'three'/, "3B sahne Three.js modulunu kullanmali");
assert.match(flowHtml, /LineBasicMaterial\(\{color:a\.color/, "operator-agent baglantisi hedef agent rengini kullanmali");
assert.match(flowHtml, /ConeGeometry\(/, "3B baglanti agent yonunu gosteren ok ucu icermeli");
assert.match(flowHtml, /b\.packets\.length/, "aktif baglantida operator-agent yonlu veri paketleri animasyonu olmali");
assert.match(flowHtml, /dir==='down'\?a\.color:0xa98bff/, "delegasyon darbesi agent, geri donus darbesi operator rengini kullanmali");
assert.match(html, /function removeDraftAgent\(/, "silinen otomatik agent tercihi izlenmeli");
assert.match(html, /draftIgnoredAdapters/, "otomatik kesif engel listesi UI durumunda tutulmali");
assert.match(html, /yerel taslaklar korundu/, "CLI taramasi kaydedilmemis taslaklari korumali");
assert.match(html, /data-testid="autonomous-consent"/, "ilk kullanim otonom izin uyarisi bulunmali");
assert.match(html, /autonomousConsentAcceptedAt/, "otonom izin kalici config kaydiyla izlenmeli");
assert.match(html, /id="newAgentCli"/, "yeni agent CLI sablonu dropdown ile secilmeli");
assert.match(html, /function addAgentFromCli\(/, "secilen CLI varsayilanlari yeni agente uygulanmali");
assert.match(html, /@keyframes teamRail/, "dashboard takim baglantilari animasyonlu akis rayi kullanmali");
assert.match(html, /@keyframes nodeOrbit/, "dashboard agent dugumu katmanli hareket kimligi kullanmali");
assert.match(html, /process\.progress/, "sessiz CLI icin canli bekleme durumu gosterilmeli");
assert.match(html, /process\.silence-timeout/, "sessiz CLI otomatik durdurma durumu gosterilmeli");
assert.match(html, /function latestDashboardRun\(/, "dashboard aktif veya en son gorevi bulmali");
assert.match(html, /async function restoreDashboardRun\(/, "dashboard donuste gorev olaylarini otomatik geri yuklemeli");
assert.match(html, /async function bootstrapDashboard\(\)[\s\S]*await restoreDashboardRun\(\)[\s\S]*bootstrapping=false/, "gecmis olaylar canli SSE tamponu bosaltilmadan once replay edilmeli");
assert.match(html, /bufferedEvents\.push\(\{type,data\}\)/, "bootstrap sirasindaki canli olaylar kaybolmamali");
assert.match(codeHtml, /class=\"diff-hunk\"/, "canli kodlama Git-benzeri hunk basligi gostermeli");
assert.match(codeHtml, /f\.hunks/, "canli kodlama satir diff payload'ini render etmeli");
assert.match(codeHtml, /Hassas dosya içeriği güvenlik için gizlendi/, "hassas dosya diff icerigi UI'da gizlenmeli");
assert.match(html, /uzun süre yeni çıktı vermediği için otomatik durduruldu/, "sessizlik mesaji onceki ilerlemeyi yok saymamalı");
assert.match(html, /\.friendly-error\{[^}]*overflow-wrap:anywhere/, "agent ozet kutusundaki uzun metin kutu disina tasmamali");
assert.match(html, /OpenCode modeli/, "OpenCode agenti icin kesfedilen model secimi sunulmali");
assert.match(html, /data-tab="clis"/, "CLI ve model ayarlari ayri sekmede olmali");
assert.match(html, /function renderClis\(/, "CLI ayarlari ayri renderer kullanmali");
assert.match(html, /id="codexModel"/, "Codex global model secimi bulunmali");
assert.match(html, /id="claudeModel"/, "Claude Code global model secimi bulunmali");
assert.match(html, /id="opencodeModel"/, "OpenCode global model secimi bulunmali");
assert.match(html, /Claude Code modeli/, "Claude Code agenti icin model override secimi sunulmali");
assert.match(html, /api\/claude\/models/, "Claude modelleri kullanicinin Claude Code oturumundan dinamik alinmali");
assert.match(html, /hesabı, sağlayıcısı ve kurum politikası/, "Claude katalog kapsamı kullaniciya aciklanmali");
assert.match(html, /model\.description/, "Claude modelinin guncel surumu CLI aciklamasindan gosterilmeli");
assert.doesNotMatch(html, /CLAUDE_MODEL_CATALOG/, "tum kullanicilar icin gecersizlesebilen statik Claude katalogu bulunmamali");
assert.doesNotMatch(html, /minVersion:/, "yerel surume gore gomulu model kapisi bulunmamali");
assert.doesNotMatch(html, /id="operatorModel"/, "operator sekmesi model ayari icermemeli");
assert.match(html, /CLI ayarını kullan \(/, "agent model secimi miras alinan CLI modelini gostermeli");
assert.doesNotMatch(html, /serbest model adı/, "Claude ve Gemini icin serbest metin model alani olmamali");
assert.match(html, /doğrulanmış model kataloğu yok/, "katalogsuz CLI'lar varsayilan model davranisini aciklamali");
assert.match(html, /function setAgentCommand\(/, "CLI komutu degisince adapter UI tarafinda eslenmeli");
assert.match(html, /adapter ve güvenli varsayılan argümanlar otomatik eşitlenir/, "adapter esleme davranisi kullaniciya aciklanmali");
assert.match(html, /rolü görev türünü bağlayıcı biçimde sınırlar/, "uzman rolunun gorev turunu sinirladigi aciklanmali");
assert.match(html, /planner → executor → reviewer/, "balanced rol zinciri agent ayarlarinda aciklanmali");
// Dogrulama kapisi: Genel ayarlarda duzenlenebilir olmali ve kaydetme yoluna baglanmali.
assert.match(html, /id="verifyCommands"/, "Genel ayarlar dogrulama komutu alani icermeli");
assert.match(html, /id="verifyTimeout"/, "dogrulama zaman asimi ayarlanabilir olmali");
assert.match(html, /id="verifyBlock"/, "kirmizi kapi davranisi (engelle/rapor) secilebilir olmali");
assert.match(html, /verify:\{\.\.\.\(STATE\.config\.verify\|\|\{\}\)/, "kapi ayarlari kaydetme govdesine eklenmeli");
assert.match(html, /Kapı kırmızıysa hiçbir hızlı yol teslimatı kapatamaz/, "kapinin teslimat uzerindeki etkisi kullaniciya aciklanmali");
// Git worktree izolasyonu: Genel ayarlardan yonetilebilir olmali.
assert.match(html, /id="wtMode"/, "worktree modu secilebilir olmali");
assert.match(html, /id="wtLinks"/, "worktree'ye baglanacak klasorler girilebilir olmali");
assert.match(html, /id="wtSetup"/, "worktree kurulum komutlari girilebilir olmali");
assert.match(html, /worktree:\{\.\.\.\(STATE\.config\.worktree\|\|\{\}\)/, "worktree ayarlari kaydetme govdesine eklenmeli");
assert.match(html, /Uzağa hiçbir şey gönderilmez/, "push\/PR yapilmadigi kullaniciya acikca soylenmeli");
// Es zamanli gorev: ayar alani + coklu kosan gorevin gosterimi.
assert.match(html, /id="maxConc"/, "es zamanli gorev sayisi ayarlanabilir olmali");
assert.match(html, /maxConcurrentTasks:/, "es zamanlilik ayari kaydetme govdesine eklenmeli");
assert.match(html, /görev eşzamanlı/, "birden fazla kosan gorev durum satirinda gosterilmeli");
// Pano: kosan TUM gorevleri gostermeli (tekil current'a sabitlenmemeli).
assert.match(boardHtml, /s\.currents/, "board.html es zamanli gorev listesini tuketmeli");
assert.match(boardHtml, /runs\.map\(r=>runningCard\(r\)\)/, "board.html Calisiyor sutununda tum kosan gorevleri gostermeli");
// ---- Ice donuk MCP: AYRI SEKME, form tabanli (ham JSON degil) ----
assert.match(html, /data-tab="mcp"/, "Ayarlar'da MCP Araclari sekmesi olmali");
assert.match(html, /function renderMcp\(/, "MCP sekmesi render fonksiyonu olmali");
assert.doesNotMatch(html, /id="mcpJson"/, "MCP artik ham JSON alaniyla degil formla yonetilmeli");
assert.match(html, /const MCP_PRESETS=\[/, "tek tikla eklenebilen hazir sunucu sablonlari olmali");
assert.match(html, /function mcpAdd\(/, "sunucu ekleme fonksiyonu olmali");
assert.match(html, /function mcpRemove\(/, "sunucu silme fonksiyonu olmali");
assert.match(html, /function mcpEffectiveKinds\(/, "fiilen verilecek turler kullaniciya gosterilmeli");
assert.match(html, /Operatör MCP kullanmaz/, "operatorun MCP kullanmadigi acikca yazilmali");
assert.match(html, /hiçbir koşulda<\/b> verilmez/, "yazma yetkilisinin salt-okunur turlere verilmedigi aciklanmali");
assert.match(html, /sandbox\) garantisini kapsamaz/, "MCP'nin sandbox garantisini deldigi uyarisi bulunmali");
assert.match(html, /kimlik bilgisiyle \(örn\. read-only DB kullanıcısı\)/, "yetkinin kimlik bilgisiyle kuruldugu anlatilmali");
// codex opt-in bypass: kutu + uyari + kaydetme govdesi.
assert.match(html, /codex için MCP'yi zorla aç \(sandbox'sız\)/, "codex bypass opt-in kutusu olmali");
assert.match(html, /codexUnsafeBypass:!!draftMcp\.codexUnsafeBypass/, "codex bypass ayari kaydetme govdesine eklenmeli");
assert.match(html, /ajan hapsi \(sandbox\) devre dışı/, "bypass'in sandbox'i kapattigi acikca yazilmali");
// ---- JSON'dan ice aktarma: MCP dokumantasyonlarinin verdigi panoyu dogrudan kabul etmeli ----
assert.match(html, /function mcpParseImport\(/, "MCP JSON ice aktarma parser'i olmali");
assert.match(html, /id="mcpImportText"/, "yapistirma alani olmali");
assert.match(html, /JSON'dan içe aktar/, "ice aktarma butonu olmali");
{
  // Parser saf oldugu icin izole calistirilabilir; gercek dunya bicimleriyle test ediyoruz.
  const src = html.match(/const MCP_KINDS=\[[\s\S]*?function mcpToggleImport\(/)[0];
  const parse = new Function(`${src.replace(/function mcpToggleImport\($/, "")} return mcpParseImport;`)();

  // (a) Standart bicim — firecrawl dokumantasyonundaki gerceginin aynisi.
  const firecrawl = parse('{"mcpServers":{"firecrawl-mcp":{"command":"npx","args":["-y","firecrawl-mcp"],"env":{"FIRECRAWL_API_KEY":"YOUR-API-KEY"}}}}');
  assert.ok(!firecrawl.error, `standart mcpServers bicimi kabul edilmeli: ${firecrawl.error || ""}`);
  assert.equal(firecrawl.servers.length, 1);
  assert.equal(firecrawl.servers[0].name, "firecrawl-mcp");
  assert.equal(firecrawl.servers[0].command, "npx");
  assert.equal(firecrawl.servers[0].argsText, "-y\nfirecrawl-mcp", "args satir satir alana aktarilmali");
  assert.equal(firecrawl.servers[0].envText, "FIRECRAWL_API_KEY=YOUR-API-KEY", "env ANAHTAR=deger satirina cevrilmeli");
  assert.equal(firecrawl.servers[0].write, false, "ice aktarilan sunucu salt okunur gelmeli");
  assert.equal(firecrawl.servers[0].kinds.length, 4, "ice aktarilan sunucu tum turlere acik gelmeli (kullanici daraltir)");

  // (b) Sarmalayicisiz ve (c) tek sunucu nesnesi de kabul edilmeli.
  assert.equal(parse('{"docs":{"command":"npx","args":["d"]}}').servers[0].name, "docs", "sarmalayicisiz bicim kabul edilmeli");
  assert.equal(parse('{"command":"npx","args":["x"]}').servers[0].name, "yeni-sunucu", "tek sunucu nesnesi kabul edilmeli");
  assert.equal(parse('{"servers":{"a":{"command":"x"}}}').servers[0].name, "a", "servers sarmalayicisi da taninmali");

  // (d) Uzak sunucu: url varsa command/args gonderilmemeli.
  const remote = parse('{"mcpServers":{"uzak":{"type":"http","url":"https://o/mcp"}}}').servers[0];
  assert.equal(remote.url, "https://o/mcp");
  assert.equal(remote.command, "", "url verildiyse command bos kalmali");
  assert.equal(remote.argsText, "", "url verildiyse args bos kalmali");

  // (e) Gecersiz ad temizlenmeli, `disabled` bayragi onurlandirilmali.
  assert.equal(parse('{"mcpServers":{"benim sunucum!":{"command":"x"}}}').servers[0].name, "benim-sunucum", "gecersiz karakterler ada uygun hale getirilmeli");
  assert.equal(parse('{"mcpServers":{"a":{"command":"x","disabled":true}}}').servers[0].enabled, false, "disabled:true kapali gelmeli");

  // (f) Hatalar ACIKCA bildirilmeli; sessizce bos sonuc DONMEMELI.
  assert.match(parse("").error, /boş/, "bos girdi hata vermeli");
  assert.match(parse("{bozuk").error, /ayrıştırılamadı/, "bozuk JSON hata vermeli");
  assert.match(parse('{"mcpServers":{"a":{}}}').error, /command.*url/s, "command/url olmadan hata vermeli");
  assert.match(parse("[]").error, /nesne/, "dizi reddedilmeli");
  // Kismi gecerlilik: gecerliler alinir, gecersizler sayilir.
  const mixed = parse('{"mcpServers":{"iyi":{"command":"x"},"kotu":{}}}');
  assert.equal(mixed.servers.length, 1, "gecerli sunucu alinmali");
  assert.deepEqual(mixed.skipped, ["kotu"], "atlanan giris bildirilmeli");
}

// Arayuzun URETTIGI sekil gecerli olmali: taslak -> config donusumunu GERCEKTEN kosturuyoruz.
// Bu, formun API'nin reddedecegi bir govde uretmesi riskini kapatir.
{
  const saveBlock = html.match(/if\(draftMcp\)\{[\s\S]*?servers\}\}/);
  assert.ok(saveBlock, "MCP kaydetme blogu bulunmali");
  const draftMcp = {
    enabled: true, mode: "strict", maxServersPerAssignment: 2, startupTimeoutMs: 15000,
    servers: [
      { name: "  docs  ", command: "npx", argsText: "-y\n\ndocs-mcp", envText: "A=1\n\nBOZUK\nB=2=3", kinds: ["plan", "review"], agents: ["", "w1"], write: false, enabled: true, description: " dok " },
      { name: "uzak", url: " https://o/mcp ", command: "yok", argsText: "atilmali", envText: "", kinds: ["implement"], agents: [], write: true, enabled: false, description: "" },
      { name: "   ", command: "x" }, // adsiz: ATILMALI
    ],
  };
  const STATE = { config: {} };
  new Function("draftMcp", "STATE", saveBlock[0])(draftMcp, STATE);
  const m = STATE.config.mcp;
  assert.deepEqual(Object.keys(m.servers), ["docs", "uzak"], "adsiz sunucu atilmali, adlar trim'lenmeli");
  assert.deepEqual(m.servers.docs.args, ["-y", "docs-mcp"], "bos arguman satirlari atilmali");
  assert.deepEqual(m.servers.docs.env, { A: "1", B: "2=3" }, "ANAHTAR=deger ayristirilmali; '=' iceren deger korunmali, gecersiz satir atilmali");
  assert.equal(m.servers.docs.description, "dok", "aciklama trim'lenmeli");
  assert.deepEqual(m.servers.docs.agents, ["w1"], "bos agent adi atilmali");
  assert.equal(m.servers.uzak.url, "https://o/mcp", "URL trim'lenmeli");
  assert.equal(m.servers.uzak.command, undefined, "URL verildiyse command/args gonderilmemeli");
  assert.equal(m.servers.uzak.write, true);
  assert.equal(m.servers.uzak.enabled, false);
  assert.equal(m.mode, "strict");
  assert.equal(m.maxServersPerAssignment, 2);
  // HALKAYI KAPAT: arayuzun urettigi sekil motorun normalizasyonundan sag cikmali. Aksi halde
  // kullanici formu doldurur, kaydeder ve sunucu sessizce dusurulur.
  const mcpModule = require("../src/mcp");
  const normalized = mcpModule.normalizeConfig({ mcp: m });
  assert.deepEqual(Object.keys(normalized.servers).sort(), ["docs", "uzak"], "form cikti sunuculari normalizasyonda KORUNMALI");
  assert.deepEqual(normalized.servers.docs.kinds, ["plan", "review"], "kind kisiti normalizasyondan gecmeli");
  assert.equal(normalized.servers.docs.env.B, "2=3", "ortam degeri normalizasyonda bozulmamali");
  assert.equal(normalized.enabled, true, "etkin bayragi korunmali");
  // Rol kapisi form ciktisi uzerinde de gecerli: docs plan/review'e gider, uzak (write) gitmez.
  assert.deepEqual(mcpModule.resolveForAssignment({ mcp: normalized }, { kind: "plan", agentName: "w1" }).map((s) => s.name), ["docs"], "form ciktisinda rol kapisi calismali");
}
// Agent ayarlari saglik durumunu gostermeli: "Aktif" yalnizca izindir; saglik testi hazir
// degilse operator uzmani kullanmaz ve bu kullaniciya acikca yazilmalidir.
{
  assert.match(html, /'schedules','cli-health'\]\)es\.addEventListener/, "dashboard cli-health olayini dinlemeli");
  assert.match(html, /type==='cli-health'\)\{STATE\.cliStatus=data;refreshHealthViews\(\)\}/, "cli-health olayi saglik gorunumlerini yenilemeli");
  assert.match(html, /<span id="cliScanBadges">/, "CLI taramasi rozetleri canli yenilenebilmeli");
  const pick = (name) => html.match(new RegExp(`^(?:const ${name}=.*|function ${name}\\(.*)$`, "m"))[0];
  const source = ["HEALTH_TONE", "cliHealth", "healthTone", "healthReset", "agentHealthHtml", "cliScanBadge", "adapterOf"].map(pick).join("\n");
  const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const STATE = { cliStatus: [
    { id: "codex", installed: true, version: "codex-cli 0.154.0", health: { status: "quota", label: "Kullanım limiti doldu", detail: "ChatGPT planının Codex kullanım hakkı bitti; yenilenme: Sep 22nd, 2026 10:58 AM. ham" } },
    { id: "claude", installed: true, version: "2.1.278", health: { status: "ready", label: "Hazır", detail: "Gerçek sağlık testi başarılı." } },
    { id: "gemini", installed: true, version: "0.18.4", health: { status: "auth-required", label: "Giriş gerekli", detail: "auth" } },
  ] };
  const ui = new Function("STATE", "esc", `${source}\nreturn { agentHealthHtml, cliScanBadge };`)(STATE, esc);
  const codexLine = ui.agentHealthHtml({ adapter: "codex", cmd: "codex" }, 0);
  assert.match(codexLine, /var\(--warn\)/, "kullanim limiti uyari renginde gorunmeli");
  assert.match(codexLine, /Kullanım limiti doldu · yenilenme: Sep 22nd, 2026 10:58 AM · operatör bu uzmanı kullanmıyor/);
  assert.match(ui.agentHealthHtml({ adapter: "claude", cmd: "claude" }, 1), /var\(--ok\).*Hazır · operatör kullanabilir/);
  assert.match(ui.agentHealthHtml({ adapter: "gemini", cmd: "gemini" }, 2), /var\(--err\).*Giriş gerekli/);
  assert.match(ui.agentHealthHtml({ adapter: "codex", cmd: "codex", enabled: false }, 0), /Kapalı · operatör bu uzmanı kullanmaz/);
  assert.match(ui.cliScanBadge(STATE.cliStatus[0]), /color:var\(--warn\).*codex codex-cli 0\.154\.0 · Kullanım limiti doldu/, "kurulu ama limiti dolu CLI yesil gorunmemeli");
  assert.match(ui.cliScanBadge(STATE.cliStatus[1]), /color:var\(--ok\).*· Hazır/);
  assert.match(ui.cliScanBadge({ id: "opencode", installed: false }), /color:var\(--dim\).*○ opencode kurulu değil/);
}
console.log("ui smoke ok");
