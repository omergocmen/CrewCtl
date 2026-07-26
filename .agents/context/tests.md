# Tests Context

**Sources:** `orchestrator/test/**`, `package.json`

**Last verified:** 2026-07-25

## Purpose

Gerçek model/provider çağrısı yapmadan CLI, UI syntax/smoke ve uçtan uca ekip akışlarını doğrular.

## Current suites

- `test/ui-smoke.test.js`: dashboard, ekip akışı ve canlı kod HTML'lerindeki inline script'leri derler; zorunlu DOM ID'lerini, dashboard replay'ini, Canlı Kod aktif görev fallback/öncelik davranışını ve 3B bağlantı sözleşmelerini doğrular.
- `test/cli.test.js`: config göçü/saflığı, adapter/cmd uzlaştırması, prompt-file health hazırlığı/temizliği, katalog destekli model argümanları, OpenCode miras/override ayrımı, parser/readiness, discovery/ignore davranışı ve `crewctl` help/version/status/task/approval CLI akışlarını test eder.
- `test/team-flow.test.js`: fake CLI'larla fast/balanced görev, approval devamı, operator chat, recovery/routing, rol bazlı `allowedKinds`, PASS hızlı yolu, inceleme valisi, kısmi teslimat, ID dedupe, OpenCode JSON ve consent davranışlarını test eder.
- `test/live-diff.test.js`: canlı filechange tekilleştirmesini, aynı dosyanın yeniden yayınını, created/modified/deleted satır hunk'larını, line counts, hassas içerik redaksiyonunu, kalıcı replay olaylarını ve timer bayraklarını test eder.
- `test/schedule.test.js`: zamanlama doğrulamasını, sonraki çalışma hesabını ve due seçimini test eder.
- `test/checkpoints.test.js`: checkpoint oluşturma, saklama ve güvenli geri yükleme davranışlarını test eder.
- `test/verify.test.js`: doğrulama kapısını iki katmanda test eder — saf normalizasyon/idempotanlık, gerçek komut koşumu (çıkış kodu, stderr, zaman aşımı + proses ağacı sonlandırma, cwd, fail-fast) ve sahte CLI ile uçtan uca yeşil/kırmızı kapı senaryosu (hızlı yolun bastırılması, uyarılı teslimat, `delivery.verify` kanıtı).
- `test/server-flow.test.js`: canlı sunucu üzerinde açılış sırasında görev kabulünü, temel uçları ve `verify` config sözleşmesinin geçerli/geçersiz gövde matrisini test eder.
- `test/mcp.test.js`: içe dönük MCP'nin **güvenlik** kurallarını test eder — operatörün hiçbir koşulda sunucu almaması, `write:true` sunucunun salt-okunur türlere verilmemesi, modelin izin kümesini genişletememesi, sağlık testinin MCP açmaması, yer tutucu çözümü ve adapter materyalizasyonu; ardından sahte CLI ile motorun uzmana `--mcp-config` enjekte ettiğini ve **operatöre etmediğini** uçtan uca doğrular.
- `test/concurrency.test.js`: eşzamanlı görev yürütmeyi test eder — `nextPending(skipIds)` sahiplenme (aynı görevin iki kez verilmemesi), `maxConcurrency` sıkıştırma, `status()` geriye uyumu; ardından gerçek git deposunda iki görevi paralel koşturup **en yüksek eşzamanlı sayının 2 olduğunu**, ayrı branch/worktree kullanıldığını, ana ağacın korunduğunu, olay kayıtlarında **yabancı görev olayı bulunmadığını** ve `callId` sayaçlarının worker başına 1'den başladığını doğrular. `test/fake-slow-cli.js` gecikme üretir (üst üste binme ölçülebilsin).
- `test/worktree.test.js`: görev başına git worktree izolasyonunu **gerçek bir git deposu** üzerinde test eder — şema normalizasyonu, git olmayan/HEAD'siz klasörde güvenli geri düşme, izole ağaç, kirli depo bildirimi, `linkPaths` bağlama, kurulum komutu, branch'e commit, ana ağacın korunması, branch benzersizleştirme ve temizlik; ayrıca sahte CLI ile motorun gerçekten izole ağaçta koştuğunu uçtan uca doğrular. Git kurulu değilse kendini atlar.
- `test/mcp-server.test.js`: dışa dönük MCP sunucusunu test eder — sürüm uzlaşması, satır-sonu framing, bildirimlere yanıt yazılmaması, boş resource/prompt listeleri, `server/discover`, motor kontrolünün opt-in kapısı, beş aracın davranışı, panel kapalıyken yönlendirme; ayrıca `crewctl mcp` sürecini sahte panele karşı gerçek bir MCP istemcisi gibi stdio üzerinden konuşturur.
- `test/fake-cli.js` ve diğer fake komutlar: operatör/uzman stdout, stderr, auth failure ve silence senaryolarını taklit eder.

## Contracts and invariants

- Kök `npm test` sırayla UI smoke, CLI, server-flow, skills, schedule, team-flow, live-diff, checkpoints, verify, mcp-server, worktree, concurrency ve mcp testlerini çalıştırır; ilk hata zinciri durdurur.
- Git çağıran testler `shell: false` kullanmalıdır: Windows'ta `shell: true` boşluklu argümanları (commit mesajı, yol) böler.
- Testler Node'un yerleşik `assert`, `child_process`, `fs` ve geçici dizinlerini kullanır; harici test framework'ü yoktur.
- Testler gerçek Codex/Claude/Gemini/OpenCode veya ağ erişimi gerektirmemelidir.
- Oluşturulan task/runtime verileri ve temp workspace'ler test sonunda temizlenmelidir.
- `server-flow` isteklerinde `request()` hem `req` hem `res` hata olaylarını promise reddine bağlar ve isteği adlandırır; aksi halde sunucu soketi sıfırladığında sahipsiz `error` olayı yakalanmayan istisnaya dönüşüp hangi istekte olduğu belirsiz bir yığın üretir. Taşıma katmanı sıfırlamaları `requestTolerant` ile sınırlı sayıda yeniden denenir — bu yardımcı HTTP durum kodlarına dokunmaz, dolayısıyla sözleşme iddiaları gevşemez.
- Davranış değişikliği, ilgili suite'te regresyon kanıtı gerektirir; UI metin/ID sözleşmeleri smoke testle korunur.

## Interactions

Test sahipliği kaynak modül context'leriyle ortaktır. Engine/registry/role değişikliklerinde `team-flow`, CLI/store değişikliklerinde `cli`, HTML değişikliklerinde `ui-smoke` önceliklidir.

## Verification

- `npm test`

## Major Changes

### 2026-07-25 — `server-flow` teşhis edilebilirliği ve açılış dayanıklılığı

- **Change:** `request()` artık `res` hata olayını da yakalar ve tüm hataları `[METHOD path]` ile etiketler; hazır olma beklemesi sabit 600 iterasyon (30 sn) yerine 90 sn süre bütçesine geçti; taşıma katmanı sıfırlamaları için `requestTolerant` eklendi ve config şema matrisi CLI probe'ları oturduktan sonra koşuyor.
- **Reason:** Test, soğuk CLI probe'ları sürerken gelen isteğin soketi sıfırlandığında `read ECONNRESET` şeklinde hangi istekte olduğu belirsiz bir yığınla çöküyordu. Ölçüm: soğuk açılış bu makinede 13-46 sn arası değişiyor, yani 30 sn'lik sabit bütçe yetersizdi.
- **Impact:** Başarısızlıklar artık isteği adlandırıyor; suite üç ardışık tam koşumda kararlı. **Ürün tarafında açık kalan konu:** sunucu açılış probe'larıyla meşgulken bir bağlantı hiç hata log'lamadan sıfırlanabiliyor (süreç çökmüyor). Kullanıcı paneli açar açmaz istek gönderirse aynı şey olabilir; ayrı bir inceleme gerektirir.
- **Compatibility:** İddialar gevşetilmedi; `requestTolerant` yalnızca ECONNRESET/socket hang up'ı yeniden dener, durum kodlarına dokunmaz.
- **Verification:** `server-flow` tek başına 5 kez, tam paket 3 kez yeşil.
- **Files:** `orchestrator/test/server-flow.test.js`

### 2026-07-25 — Dışa dönük MCP regresyon kapsamı

- **Change:** Bağımsız `mcp-server` suite'i eklendi; sahte bir CrewCtl HTTP API'sine karşı protokol/araç davranışı ve `crewctl mcp` sürecinin stdio konuşması doğrulanıyor.
- **Reason:** MCP'de asıl risk araç mantığı değil transport ve el sıkışma detaylarıdır (framing, bildirime yanıt yazmamak, stdout kirliliği); bunlar yalnızca süreci gerçekten konuşturarak yakalanır.
- **Impact:** Gerçek panel, motor veya ağ erişimi gerekmeden MCP sözleşmesi korunur.
- **Compatibility:** Harici test bağımlılığı eklenmedi; sahte panel Node `http` ile kurulur ve rastgele port kullanır.
- **Verification:** `npm test`: on suite yeşil (`mcp server ok` dahil).
- **Files:** `orchestrator/test/mcp-server.test.js`, `package.json`

### 2026-07-25 — Doğrulama kapısı regresyon kapsamı

- **Change:** Bağımsız `verify` suite'i test zincirine eklendi; kapı kuralları (normalizasyon, fail-fast, zaman aşımı, engelleme sınırı) ve motor bağlantısı (yeşil kapıda hızlı yol korunur, kırmızı kapıda bastırılır) doğrulanıyor. `server-flow` config sözleşmesini, `ui-smoke` Ayarlar alanlarını korur.
- **Reason:** Kapının asıl riski kuralların kendisi değil, tamamlama kestirmelerini gerçekten bastırıp bastırmadığıydı; bunu yalnızca uçtan uca test kanıtlar.
- **Impact:** Kapı davranışı gerçek CLI veya ağ erişimi olmadan, sahte CLI ve `node -e` komutlarıyla doğrulanır.
- **Compatibility:** Harici test bağımlılığı eklenmedi; testler geçici `CLI_TEAM_ROOT` ve geçici workspace kullanır.
- **Verification:** `npm test`: dokuz suite yeşil (`verify ok` dahil).
- **Files:** `orchestrator/test/verify.test.js`, `orchestrator/test/server-flow.test.js`, `orchestrator/test/ui-smoke.test.js`, `package.json`

### 2026-07-24 — Claude Code model seçimi regresyon kapsamı

- **Change:** CLI suite Claude config korumasını, global model kimliğinin argümana aktarımını, açık argümanın yinelenmemesini ve SDK model metadata normalizasyonunu; UI smoke suite global/agent dropdown'larını, dinamik `/api/claude/models` kaynağını ve statik katalog/sürüm kapısı bulunmamasını doğruluyor.
- **Reason:** Claude model seçiminin şema, runtime ve iki ayar yüzeyinden birinde sessizce kaybolmasını önlemek.
- **Impact:** Otomatik testler gerçek CLI veya ağ çağrısı yapmadan dinamik katalog sözleşmesini korur; manuel metadata doğrulaması model prompt'u çalıştırmadan yapılabilir.
- **Compatibility:** Harici test bağımlılığı eklenmedi.
- **Verification:** `node orchestrator/test/cli.test.js`, `node orchestrator/test/ui-smoke.test.js`.
- **Files:** `orchestrator/test/cli.test.js`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-17 — Dashboard otomatik replay regresyonu

- **Change:** UI smoke suite dashboard'un aktif/en son görevi bulmasını, olay geçmişini bootstrap sırasında otomatik replay etmesini ve bu sıradaki SSE olaylarını tamponlamasını zorunlu kılıyor.
- **Reason:** Alt sayfalardan dashboard'a dönüldüğünde agent kartları ve akışın kaybolması regresyonunu önlemek.
- **Impact:** Replay sıralaması ve canlı olay kaybı statik UI sözleşmesi olarak korunur.
- **Compatibility:** Harici test framework'ü veya gerçek CLI çağrısı eklenmedi.
- **Verification:** `npm test`: `ui smoke ok`, `cli flow ok`, `skills ok`, `team flow ok`, `live diff ok`.
- **Files:** `orchestrator/test/ui-smoke.test.js`, `orchestrator/web/index.html`

### 2026-07-17 — Canlı satır diff regresyon kapsamı

- **Change:** Bağımsız `live-diff` suite'i ve dashboard hunk/redaksiyon smoke kontrolleri test zincirine eklendi.
- **Reason:** Dosya adları doğru görünürken içerik diff'inin bayat kalması, hassas metin sızdırması veya satır koordinatlarının bozulması regresyonlarını yakalamak.
- **Impact:** Engine ve dashboard canlı diff sözleşmesi harici framework veya gerçek CLI çağrısı olmadan doğrulanır.
- **Compatibility:** Testler geçici `CLI_TEAM_ROOT` kullanır; gerçek runtime verisine dokunmaz.
- **Verification:** `npm test`: `ui smoke ok`, `cli flow ok`, `skills ok`, `team flow ok`, `live diff ok`.
- **Files:** `orchestrator/test/live-diff.test.js`, `orchestrator/test/ui-smoke.test.js`, `orchestrator/package.json`

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
