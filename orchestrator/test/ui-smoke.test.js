const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
const flowHtml = fs.readFileSync(path.join(__dirname, "..", "web", "flow.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
assert.ok(scripts.length, "inline UI script bulunamadi");
for (const script of scripts) new Function(script);
const flowScripts = [...flowHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
assert.ok(flowScripts.length, "flow UI script bulunamadi");
for (const script of flowScripts) new Function(script);

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
assert.match(flowHtml, /\.node:before/, "akis dugumleri durum rayini kullanmali");
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
assert.match(html, /OpenCode modeli/, "OpenCode agenti icin kesfedilen model secimi sunulmali");
console.log("ui smoke ok");
