# Tests Context

**Sources:** `orchestrator/test/**`, `orchestrator/package.json`

**Last verified:** 2026-07-14

## Purpose

Gerçek model/provider çağrısı yapmadan CLI, UI syntax/smoke ve uçtan uca ekip akışlarını doğrular.

## Current suites

- `test/ui-smoke.test.js`: iki HTML dosyasındaki inline script'leri derler; zorunlu DOM ID'lerini ve kritik UI sözleşmelerini arar.
- `test/cli.test.js`: config göçü/saflığı, adapter/cmd uzlaştırması, prompt-file health hazırlığı/temizliği, katalog destekli model argümanları, OpenCode miras/override ayrımı, parser/readiness, discovery/ignore davranışı ve `crewctl` help/version/status/task/approval CLI akışlarını test eder.
- `test/team-flow.test.js`: fake CLI'larla fast/balanced görev, approval devamı, operator chat, recovery/routing, rol bazlı `allowedKinds`, PASS hızlı yolu, inceleme valisi, kısmi teslimat, ID dedupe, OpenCode JSON ve consent davranışlarını test eder.
- `test/fake-cli.js` ve diğer fake komutlar: operatör/uzman stdout, stderr, auth failure ve silence senaryolarını taklit eder.

## Contracts and invariants

- `npm test` sırayla UI smoke, CLI ve team-flow testlerini çalıştırır; ilk hata zinciri durdurur.
- Testler Node'un yerleşik `assert`, `child_process`, `fs` ve geçici dizinlerini kullanır; harici test framework'ü yoktur.
- Testler gerçek Codex/Claude/Gemini/OpenCode veya ağ erişimi gerektirmemelidir.
- Oluşturulan task/runtime verileri ve temp workspace'ler test sonunda temizlenmelidir.
- Davranış değişikliği, ilgili suite'te regresyon kanıtı gerektirir; UI metin/ID sözleşmeleri smoke testle korunur.

## Interactions

Test sahipliği kaynak modül context'leriyle ortaktır. Engine/registry/role değişikliklerinde `team-flow`, CLI/store değişikliklerinde `cli`, HTML değişikliklerinde `ui-smoke` önceliklidir.

## Verification

- `cd orchestrator && npm test`

## Major Changes

### 2026-07-14 — Balanced planner zinciri regresyonu

- **Change:** Operator yalnızca implement+review döndürse bile motorun planner eklediği, executor'ı plana ve reviewer'ı uygulamaya bağladığı test ediliyor.
- **Reason:** Hazır planlama agent'ının balanced görevlerde sessizce atlanmasını tekrar ettirmemek.
- **Impact:** Team-flow ve UI smoke suite'leri rol sırası sözleşmesini korur.
- **Compatibility:** Test fake planner salt okunur rapor, fake reviewer açık verdict üretir.
- **Verification:** İzole `npm test`: UI smoke, CLI ve team-flow yeşil.
- **Files:** `orchestrator/test/team-flow.test.js`, `orchestrator/test/fake-cli.js`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-14 — Sessizlik hata metni regresyonu

- **Change:** UI smoke testi, silence timeout açıklamasının önceki ilerlemeyi yok saymadan uzun süre yeni çıktı gelmediğini söylemesini zorunlu kılıyor.
- **Reason:** Araç çıktısı üretmiş OpenCode çağrılarının “hiç ilerleme üretmedi” şeklinde gösterilmesini engellemek.
- **Impact:** Kullanıcıya dönük stall teşhisi metin değişikliklerinde korunur.
- **Compatibility:** None.
- **Verification:** `node test/ui-smoke.test.js` ve `npm test`.
- **Files:** `orchestrator/test/ui-smoke.test.js`, `orchestrator/web/index.html`

### 2026-07-14 — Rol bazlı agent seçimi regresyonu

- **Change:** Executor/reviewer/planner katalog girdilerinin yalnızca doğru assignment türünü kabul ettiği test edildi.
- **Reason:** Sağlıklı OpenCode executor varken genel capability taşıyan planner'ın uygulama görevini almasını engellemek.
- **Impact:** Team-flow suite rol routing sözleşmesini koruyor.
- **Compatibility:** None.
- **Verification:** İzole çalışma kopyasında `npm test`: üç suite yeşil.
- **Files:** `orchestrator/test/team-flow.test.js`, `orchestrator/src/engine.js`

### 2026-07-14 — Health prompt dosyası regresyon kapsamı

- **Change:** `{PROMPT_FILE}` yer tutucusunun gerçek geçici dosyaya dönüşmesi, içeriğinin doğru yazılması, stdin davranışı ve cleanup test edildi.
- **Reason:** Sağlıklı OpenCode agent'larını katalogdan çıkaran false-negative health bozulmasını tekrar ettirmemek.
- **Impact:** Dosya tabanlı prompt kullanan adapter health değişiklikleri CLI suite tarafından korunur.
- **Compatibility:** Harici test bağımlılığı yok.
- **Verification:** İzole çalışma kopyasında `npm test`: üç suite yeşil.
- **Files:** `orchestrator/test/cli.test.js`, `orchestrator/src/cli-registry.js`

### 2026-07-14 — Çapraz-CLI argüman sızıntısı regresyonu

- **Change:** `claude→codex` ve `codex→claude` profil çelişkileri ile özel wrapper koruması test kapsamına alındı; UI komut-adapter eşleme sözleşmesi smoke teste eklendi.
- **Reason:** Bir CLI'nın bayrağının başka CLI'ya gönderildiği platform bağımsız arızanın tekrarlanmasını önlemek.
- **Impact:** Registry ve settings değişiklikleri profil tutarlılığı testlerini geçmek zorunda.
- **Compatibility:** Harici test bağımlılığı yok.
- **Verification:** İzole çalışma kopyasında `npm test`: üç suite yeşil.
- **Files:** `orchestrator/test/cli.test.js`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-14 — Model mirası ve katalog sınırı testleri

- **Change:** Eski otomatik OpenCode modelinin temizlenmesi, açık override'ın korunması, agent ekranındaki miras etiketi ve Claude/Gemini serbest alanlarının yokluğu test edildi.
- **Reason:** Global modelin gerçekten uygulanmasını ve katalogsuz CLI'larda elle model adı alınmamasını regresyona karşı korumak.
- **Impact:** CLI ve UI smoke suite'leri yeni model görünürlük/sahiplik sözleşmesini zorunlu kılıyor.
- **Compatibility:** None.
- **Verification:** İzole çalışma kopyasında `npm test`: üç suite yeşil.
- **Files:** `orchestrator/test/cli.test.js`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-14 — Model şeması ve hızlı tamamlanma regresyon kapsamı

- **Change:** Config göçü, dört adapter model önceliği, tam OpenCode parser'ı, PASS fast-path çağrı sayısı ve vali yedeği için regresyon testleri eklendi.
- **Reason:** Hız ve ayar yeniden yapılandırmasının şema, argüman ve görev yaşam döngüsü sınırlarını birlikte korumak.
- **Impact:** CLI, UI smoke ve team-flow suite'leri yeni sözleşmeleri zorunlu kılıyor.
- **Compatibility:** Harici test bağımlılığı eklenmedi.
- **Verification:** İzole çalışma kopyasında `npm test` sonucu: `ui smoke ok`, `cli flow ok`, `team flow ok`.
- **Files:** `orchestrator/test/cli.test.js`, `orchestrator/test/ui-smoke.test.js`, `orchestrator/test/team-flow.test.js`, `orchestrator/test/fake-cli.js`
