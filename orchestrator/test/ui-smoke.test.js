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
assert.match(html, /id="opencodeModel"/, "OpenCode global model secimi bulunmali");
assert.doesNotMatch(html, /id="operatorModel"/, "operator sekmesi model ayari icermemeli");
assert.match(html, /CLI ayarını kullan \(/, "agent model secimi miras alinan CLI modelini gostermeli");
assert.doesNotMatch(html, /serbest model adı/, "Claude ve Gemini icin serbest metin model alani olmamali");
assert.match(html, /doğrulanmış model kataloğu yok/, "katalogsuz CLI'lar varsayilan model davranisini aciklamali");
assert.match(html, /function setAgentCommand\(/, "CLI komutu degisince adapter UI tarafinda eslenmeli");
assert.match(html, /adapter ve güvenli varsayılan argümanlar otomatik eşitlenir/, "adapter esleme davranisi kullaniciya aciklanmali");
assert.match(html, /rolü görev türünü bağlayıcı biçimde sınırlar/, "uzman rolunun gorev turunu sinirladigi aciklanmali");
assert.match(html, /planner → executor → reviewer/, "balanced rol zinciri agent ayarlarinda aciklanmali");
console.log("ui smoke ok");
