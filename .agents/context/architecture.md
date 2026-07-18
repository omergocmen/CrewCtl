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
- `orchestrator/src/schedule.js`: zamanlanmış görevlerin saf (yan etkisiz) doğrulama ve sonraki-çalışma hesabı.
- `orchestrator/web/index.html`: ana dashboard ve tüm yönetim modalları (zamanlama sekmesi dahil).
- `orchestrator/web/flow.html`: Three.js/WebGL tabanlı canlı ekip akışı, agent filosu ve görev zaman çizelgesi.
- `orchestrator/web/code.html`: dosya/hunk bazlı Git benzeri canlı kod diff'i ve görev geçmişi replay'i.
- `orchestrator/web/board.html`: görev yaşam döngüsünü sütunlarla gösteren salt-görsel Kanban panosu.
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

### 2026-07-18 — Yayınlanabilir paket: `npx crewctl` ve veri/asset ayrımı

- **Change:** Paket npm'e yayınlanabilir hale getirildi (`private` kaldırıldı, `files`/repository/
  homepage/bugs eklendi) ve `store.js` **ASSETS (paket, salt-okunur) ↔ ROOT (yazılabilir veri)**
  ayrımı yaptı. Kurulu modda veri `~/.crewctl`'e (env `CREWCTL_HOME`) yazılır; geliştirme
  kopyasında (`test/` mevcut) davranış korunur (ROOT=ASSETS). `roles/`+`skills/` varsayılanları
  ilk çalışmada veri köküne seed edilir; `web/` ve `config.default.json` ASSETS'ten okunur.
  Çalışma klasörü `store.WORK_BASE` (=cwd) üzerinden çözülür; `config.default.json` `workingDir: "."`.
  Komutsuz `crewctl`/`npx crewctl` paneli başlatır.
- **Reason:** Uygulamayı klonlamadan tek komutla (`npx crewctl`) çalıştırılabilir kılmak; veriyi
  npm önbelleğine değil kalıcı kullanıcı dizinine yazmak.
- **Impact:** `store.js`, `server.js`, `engine.js`, `cli.js`, `package.json`, `config.default.json`
  ve README'ler etkilendi; ayrıntı için `configuration.md`.
- **Compatibility:** `CLI_TEAM_ROOT` önceliği korunur → tüm testler izole çalışır; dev `npm start`/
  `npm test` davranışı değişmez. Yalnız Node core kullanılır (sıfır bağımlılık korunur).
- **Verification:** `npm test`; `npm pack` + kurulu-mod simülasyonu (veri `CREWCTL_HOME`'a,
  paket dizinine değil; roles/skills seed; config.json üretildi; panel 200).
- **Files:** `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/src/engine.js`,
  `orchestrator/src/cli.js`, `orchestrator/package.json`, `orchestrator/config.default.json`,
  `README.md`, `orchestrator/README.md`

### 2026-07-18 — Kanban Pano ve zamanlanmış görevler

- **Change:** Görev yaşam döngüsünü sütunlarla gösteren salt-görsel `board.html` ve dostça ön
  ayarlı zamanlama katmanı (`schedule.js`, `config.schedules`, `/api/schedules`, `schedules`
  SSE olayı, 30 sn zamanlayıcı tik'i, Ayarlar → Zamanlama sekmesi) eklendi. Ayrıntı için
  `board.md` ve `scheduling.md`.
- **Reason:** Kuyruğu tek bakışta anlaşılır kılmak ve tekrar eden görevleri otomatik kuyruğa almak.
- **Impact:** İki yeni yüzey; ikisi de mevcut task/queue/SSE sözleşmesini additive biçimde tüketir.
  Zamanlanan görev motor duruyorsa yalnızca kuyruğa girer (otomatik başlatma yok).
- **Compatibility:** `schedules` yoksa `[]` varsayılır; mevcut config, kuyruk ve UI davranışı korunur.
- **Verification:** `npm test`; yeni `schedule.test.js`, genişletilmiş `ui-smoke.test.js` ve canlı
  `/api/schedules` duman testi.
- **Files:** `orchestrator/src/schedule.js`, `orchestrator/src/store.js`, `orchestrator/src/server.js`,
  `orchestrator/config.default.json`, `orchestrator/web/board.html`, `orchestrator/web/index.html`,
  `orchestrator/test/schedule.test.js`, `orchestrator/test/ui-smoke.test.js`

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
