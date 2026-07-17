# Architecture Context

**Sources:** `README.md`, `orchestrator/package.json`, `orchestrator/src/*.js`, `orchestrator/web/*.html`

**Last verified:** 2026-07-17

## Purpose

CrewCtl, kurulu Codex, Claude Code, Gemini ve OpenCode CLI'larını tek bir operatör yönetiminde uzman ekip olarak çalıştıran yerel, sıfır runtime bağımlılıklı Node.js uygulamasıdır.

## Current structure

- `orchestrator/src/cli.js`: terminal girişi ve kuyruk komutları.
- `orchestrator/src/server.js`: HTTP/SSE sunucusu, JSON API ve statik web sunumu.
- `orchestrator/src/engine.js`: görev yaşam döngüsü, CLI prosesleri, delegasyon, inceleme ve kurtarma.
- `orchestrator/src/store.js`: dosya tabanlı kuyruk, config, olaylar, hafıza ve çağrı bütçesi.
- `orchestrator/src/cli-registry.js`: CLI keşfi, model/argüman normalizasyonu ve sağlık kontrolleri.
- `orchestrator/src/skill-registry.js`: yerel skill keşfi, eşleştirme, bağlam bütçesi ve çağrı takibi.
- `orchestrator/src/checkpoints.js`: görev öncesi çalışma klasörü checkpoint'i, listeleme, saklama limiti ve güvenli geri yükleme.
- `orchestrator/web/index.html`: ana dashboard ve tüm yönetim modalları.
- `orchestrator/web/flow.html`: Three.js/WebGL tabanlı canlı ekip akışı, agent filosu ve görev zaman çizelgesi.
- `orchestrator/web/code.html`: dosya/hunk bazlı Git benzeri canlı kod diff'i ve görev geçmişi replay'i.
- `orchestrator/roles/`: operatör ve uzman prompt sözleşmeleri.
- `orchestrator/test/`: bağımlılıksız Node testleri ve sahte CLI prosesleri.

## Contracts and invariants

- Ürünün görünen adı `CrewCtl`, npm paket ve global executable adı `crewctl`'dir; “command center” yalnızca web arayüzünü açıklayan genel bir ifadedir.
- Node.js 18+ ve CommonJS kullanılır; `package.json` runtime bağımlılığı tanımlamaz.
- Uygulama yerel CLI kimlik doğrulamalarını kullanır; ayrı API anahtarı yönetmez.
- Windows, macOS ve Linux desteklenir; proses ve yol değişiklikleri üç platformu gözetmelidir.
- Operatör bir CLI'dır ve daima `roles/operator.md` rolünü kullanır; uzman agent profilleri `config.agents` altındadır.
- `config.json`, kuyruk, state olayları ve memory logları yereldir ve Git'e girmez.

## Interactions

Dashboard, Ekip Akışı ve Canlı Kod sayfaları `server.js` API/SSE sözleşmesine bağlıdır. Sayfalar açılışta aktif ya da son görevin kalıcı olaylarını replay eder, replay sırasında gelen canlı olayları tamponlayıp tekilleştirir. Server; `store`, `engine`, `cli-registry` ve `checkpoints` modüllerini birleştirir. CLI, server olmadan aynı store ve engine'i kullanabilir.

## Verification

- `cd orchestrator && npm run doctor`
- `cd orchestrator && npm test`

## Major Changes

### 2026-07-17 — Canlı görünürlük ve görev öncesi sürümleme genişletildi

- **Change:** Three.js tabanlı Ekip Akışı, Git benzeri Canlı Kod diff'i, sayfalar arası otomatik görev replay'i ve görev öncesi checkpoint/geri yükleme akışı eklendi; kök README bu yüzeyleri yeni Ekip Akışı görseliyle belgeleyecek şekilde yenilendi.
- **Reason:** Operatör–agent veri akışını, gerçek dosya değişikliklerini ve önceki görevin durumunu kullanıcıya kesintisiz göstermek; agent değişikliklerinden güvenli dönüş sağlamak.
- **Impact:** Kullanıcılar delegasyonları CLI renkleri ve veri paketleriyle izleyebilir, eklenen/silinen satırları dosya bazında görebilir ve motor boşta iken tamamlanan ya da başarısız bir görevin öncesindeki sürüme dönebilir.
- **Compatibility:** `liveDiff` ve `versioning` varsayılan olarak açıktır; geçmişi olmayan görevler ve içerik güvenle gösterilemeyen dosyalar mevcut fallback/redaksiyon davranışını kullanır.
- **Verification:** `npm test`; `team-flow.test.js`, `live-diff.test.js`, `checkpoints.test.js` ve dashboard UI smoke senaryoları.
- **Files:** `README.md`, `image-1.png`, `orchestrator/web/index.html`, `orchestrator/web/flow.html`, `orchestrator/web/code.html`, `orchestrator/src/engine.js`, `orchestrator/src/server.js`, `orchestrator/src/checkpoints.js`, `orchestrator/test/`

### 2026-07-14 — Proje ve dağıtılabilir CLI adı CrewCtl oldu

- **Change:** Görünen ürün adı `CrewCtl`, npm paket adı ve global executable `crewctl` olarak güncellendi; web başlıkları, terminal banner'ları, Codex istemci metadata'sı ve dokümantasyon aynı markaya taşındı.
- **Reason:** Proje adını önceki açıklayıcı ifadeden ayırıp tek ve tutarlı bir ürün kimliği kullanmak.
- **Impact:** Kullanıcılar `npm link` sonrasında komutları `crewctl` adıyla çalıştırır; yardım metni ve örnekler yeni komut adını gösterir.
- **Compatibility:** Önceki executable alias artık yayımlanmaz; kullanan shell scriptleri ve yerel bağlantılar `crewctl` olarak güncellenmelidir.
- **Verification:** `npm test`, `npm run cli -- help`, `npm run cli -- version` ve eski marka metni taraması.
- **Files:** `orchestrator/package.json`, `orchestrator/src/cli.js`, `orchestrator/src/server.js`, `orchestrator/src/doctor.js`, `orchestrator/src/cli-registry.js`, `orchestrator/web/index.html`, `orchestrator/web/flow.html`, `README.md`, `orchestrator/README.md`
