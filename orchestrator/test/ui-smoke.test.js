const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
const flowHtml = fs.readFileSync(path.join(__dirname, "..", "web", "flow.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
assert.ok(scripts.length, "inline UI script bulunamadi");
for (const script of scripts) new Function(script);
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
assert.match(html, /uzun süre yeni çıktı vermediği için otomatik durduruldu/, "sessizlik mesaji onceki ilerlemeyi yok saymamalı");
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
