# Roles Context

**Sources:** `orchestrator/roles/*.md`, `orchestrator/src/engine.js`, `orchestrator/src/store.js`, `orchestrator/src/server.js`

**Last verified:** 2026-07-14

## Purpose

Operatör ve uzman CLI çağrılarına verilen sorumluluk, sınır ve çıktı sözleşmelerini tanımlar.

## Current roles

- `operator.md`: doğrudan uygulama yapmayan teknik lider; plan/delegasyon ve yalnızca JSON karar protokolü.
- `executor.md`: delege edilen işi gerçekten uygular, hedefli doğrular ve `COMPLETED|BLOCKED` teslimat raporu verir.
- `reviewer.md`: salt-okunur bağımsız denetim; bulgular ve son satırda `VERDICT: PASS|FAIL`.
- `planner.md`: salt-okunur, uygulanabilir plan ve kabul kriterleri üretir.
- `operator-chat.md`: tamamlanmış görev kayıtlarından salt-okunur takip yanıtı verir.

## Contracts and invariants

- Operatör CLI her zaman `roles/operator.md` kullanır ve uzman profillerinden ayrıdır.
- Balanced akışta hazır standart roller ilk planda `plan → implement → review` olarak `dependsOn` ile zincirlenir; fast mod küçük görevlerde tek executor kullanabilir.
- Engine role dosyası adından yetenek ipuçları türetir: executor→implementation, reviewer→review/testing, planner→planning, operator→planning/delegation.
- Executor, reviewer ve planner rolleri yalnızca sırasıyla `implement`, `review` ve `plan` assignment türlerini kabul eder; profil üzerindeki eski ek capability değerleri bu sınırı genişletmez.
- Reviewer kararının son satırı tam `VERDICT: PASS` veya `VERDICT: FAIL` olmalıdır.
- Rol CRUD yalnızca `roles/` altındaki Markdown dosyalarını hedefler.
- Rol protokolü değişiklikleri engine parser/prompt ve fake CLI testleriyle uyumlu olmalıdır.

## Interactions

Settings UI rol dosyalarını düzenler; server/store CRUD sağlar; engine rol metnini runtime prompt'a ekler ve çıktı sözleşmesini yorumlar.

## Verification

- `cd orchestrator && node test/team-flow.test.js`
- Rol formatı değişirse ilgili fake CLI yanıtlarını ve engine protokol parse'ını kontrol et.

## Major Changes

### 2026-07-14 — Balanced mod planner rolünü atlamıyor

- **Change:** Operatör balanced uygulama görevinde hazır planner, executor ve reviewer rollerinin üçünü de ilk turda zincirlemek zorunda.
- **Reason:** Hız optimizasyonunun kullanıcı tarafından etkinleştirilmiş planlama agent'ını devre dışı bırakmasını önlemek.
- **Impact:** Planner salt okunur plan üretir, executor bu planı uygular, reviewer gerçek teslimatı denetler.
- **Compatibility:** Fast modun küçük görev yolu ve özel rol/capability davranışı korunur.
- **Verification:** İzole `npm test`; operator prompt sözleşmesi ve engine rol zinciri regresyonu.
- **Files:** `orchestrator/roles/operator.md`, `orchestrator/src/engine.js`, `orchestrator/test/team-flow.test.js`

### 2026-07-14 — Rol seçimi routing için bağlayıcı oldu

- **Change:** Worker rol dosyası yalnızca açıklama değil, izin verilen assignment türünün kaynağı oldu.
- **Reason:** Kullanıcının executor olarak seçtiği CLI yerine planner agent'ın uygulama yapmasını önlemek.
- **Impact:** Operatör kataloğu ve engine routing aynı rol sözleşmesini uygular.
- **Compatibility:** Standart olmayan özel rol dosyaları capability tabanlı eski davranışı sürdürür.
- **Verification:** İzole `npm test`; rol başına `allowedKinds` ve yanlış rol yeniden yönlendirme kontrolleri.
- **Files:** `orchestrator/src/engine.js`, `orchestrator/web/index.html`, `orchestrator/test/team-flow.test.js`

### 2026-07-14 — Operatör tek turluk uygulama ve inceleme planlıyor

- **Change:** Operatör rolü ilk planda implement+review zincirini kuracak, PASS sonrası yeni inceleme açmayacak ve ayrı plan delegasyonunu deep moda bırakacak şekilde sıkılaştırıldı.
- **Reason:** Tamamlanmış işi tekrar denetleten pahalı turları ve balanced moddaki ayrı plan çağrısını kaldırmak.
- **Impact:** Operatör planlama protokolü ve engine'in PASS hızlı yolu birlikte çalışır.
- **Compatibility:** Deep mod ayrı planlama davranışını korur.
- **Verification:** İzole kopyada `npm test`; ilk tur PASS ve inceleme valisi senaryoları.
- **Files:** `orchestrator/roles/operator.md`, `orchestrator/src/engine.js`, `orchestrator/test/team-flow.test.js`
