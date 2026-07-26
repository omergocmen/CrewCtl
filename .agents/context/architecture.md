# Architecture Context

**Sources:** `README.md`, `CONTRIBUTING.md`, `package.json`, `.gitignore`, `.npmignore`, `orchestrator/src/*.js`, `orchestrator/web/*.html`

**Last verified:** 2026-07-25

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
- `orchestrator/src/verify.js`: doğrulama kapısı — kullanıcı komutlarının çalışma klasöründe koşumu, fail-fast raporu ve operatöre verilecek kanıt metni.
- `orchestrator/src/worktree.js`: görev başına git worktree izolasyonu — izole ağaç, branch, commit ve kurulum komutları.
- `orchestrator/src/mcp.js`: içe dönük MCP — uzman ajanlara harici araç verirken uygulanan sert kapı (kind/agent/kimlik) ve adapter'a özgü materyalizasyon planı.
- `orchestrator/src/mcp-server.js`: dışa dönük MCP sunucusu — CrewCtl'i başka kodlama ajanlarına araç olarak sunar; çalışan panelin HTTP API'sinin istemcisidir.
- `orchestrator/src/schedule.js`: zamanlanmış görevlerin saf (yan etkisiz) doğrulama ve sonraki-çalışma hesabı.
- `orchestrator/web/index.html`: ana dashboard ve tüm yönetim modalları (zamanlama sekmesi dahil).
- `orchestrator/web/flow.html`: Three.js/WebGL tabanlı canlı ekip akışı, agent filosu ve görev zaman çizelgesi.
- `orchestrator/web/code.html`: dosya/hunk bazlı Git benzeri canlı kod diff'i ve görev geçmişi replay'i.
- `orchestrator/web/board.html`: görev yaşam döngüsünü sütunlarla gösteren salt-görsel Kanban panosu.
- `orchestrator/roles/`: operatör ve uzman prompt sözleşmeleri.
- `orchestrator/test/`: bağımlılıksız Node testleri ve sahte CLI prosesleri.
- `package.json`: depo kökünden npm yayınını, `crewctl` executable'ını ve geliştirme scriptlerini tanımlar.
- `.gitignore`: yerel config/runtime verisini, agent metadata'sını ve üretilen dosyaları Git dışında tutar.
- `.npmignore` ve `package.json#files`: npm tarball'ını runtime kaynaklarıyla sınırlar; testler, yerel veri ve geliştirme metadata'sı yayımlanmaz.

## Contracts and invariants

- Ürünün görünen adı `CrewCtl`, npm paket adı `@omerrgocmen/crewctl`, global executable adı `crewctl`'dir; “command center” yalnızca web arayüzünü açıklayan genel bir ifadedir.
- Node.js 18+ ve CommonJS kullanılır; kök `package.json` runtime bağımlılığı tanımlamaz.
- Npm paketi depo kökünden yayımlanır; `bin.crewctl` hedefi `orchestrator/src/cli.js` ve sürüm kaynağı kök `package.json` dosyasıdır.
- Yayımlanmış paket `npx @omerrgocmen/crewctl` ile tüketici proje klasöründen çalıştırılır; CrewCtl kaynak deposunun kendi kökünde geliştirme girişi `npm start`'tır.
- Canonical kaynak depo `https://github.com/omergocmen/CrewCtl` adresindedir; developer modu kök dizinde `npm install`, `npm test` ve `npm start` komutlarını kullanır.
- `orchestrator/test/` altındaki test kaynakları Git'te tutulur ancak npm tarball'ına girmez; `.gitignore` yalnızca testlerin ürettiği `.tmp-*` klasörleri ve `*-output.txt` dosyalarını dışlar.
- Uygulama yerel CLI kimlik doğrulamalarını kullanır; ayrı API anahtarı yönetmez.
- Windows, macOS ve Linux desteklenir; proses ve yol değişiklikleri üç platformu gözetmelidir.
- Operatör bir CLI'dır ve daima `roles/operator.md` rolünü kullanır; uzman agent profilleri `config.agents` altındadır.
- `config.json`, kuyruk, state olayları ve memory logları yereldir ve Git'e girmez.

## Interactions

Dashboard, Ekip Akışı ve Canlı Kod sayfaları `server.js` API/SSE sözleşmesine bağlıdır. Sayfalar açılışta aktif ya da son görevin kalıcı olaylarını replay eder, replay sırasında gelen canlı olayları tamponlayıp tekilleştirir. Server; `store`, `engine`, `cli-registry` ve `checkpoints` modüllerini birleştirir. CLI, server olmadan aynı store ve engine'i kullanabilir.

## Verification

- `npm run doctor`
- `npm test`
- `npm pack --dry-run --json`

## Major Changes

### 2026-07-25 — İçe dönük MCP (Faz 1) eklendi

- **Change:** Yeni `orchestrator/src/mcp.js` ve motor materyalizasyonu; uzman ajanlar harici MCP araçları kullanabiliyor. Rol kapısı: operatör hiçbir koşulda MCP almaz. Ayrıntı için `mcp-inbound.md`.
- **Reason:** Ajanların dış dünyaya erişimi yoktu; reviewer'ın doğrulayamadığı kontroller `NOT RUN` kalıyordu.
- **Impact:** Yeni modül, `config.mcp` şeması, `agentEnvironment(agent, mcpBlock)` imzası, agent kataloğunda `tools` farkındalığı ve bağımsız test suite'i. claude + opencode destekli; codex/gemini Faz 2.
- **Compatibility:** `mcp.enabled: false` varsayılan → davranış birebir korunur; sağlık testleri MCP açmaz. Sıfır runtime bağımlılığı korunur.
- **Verification:** `npm test` (13 suite); uçtan uca test operatörde MCP argümanı bulunmadığını, uzmanda bulunduğunu doğrular.
- **Files:** `orchestrator/src/mcp.js`, `orchestrator/src/engine.js`, `orchestrator/src/cli-registry.js`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/config.default.json`, `orchestrator/web/index.html`, `orchestrator/test/mcp.test.js`, `package.json`

### 2026-07-25 — Eşzamanlı görev yürütme eklendi

- **Change:** Motor süpervizör + worker slotu mimarisine ayrıldı; `maxConcurrentTasks` (varsayılan 1) ile görevler paralel koşabiliyor. Ayrıntı için `concurrency.md`.
- **Reason:** Worktree izolasyonu geldiği için kuyruk artık güvenle paralelleştirilebilirdi; duvar saati süresi kuyruk derinliğiyle ölçekleniyor.
- **Impact:** Yeni context dosyası, `store.nextPending(skipIds)` sahiplenmesi, `status()` genişletmesi, `/api/config` güvenlik kapısı (izolasyon olmadan eşzamanlılık reddedilir) ve bağımsız test suite'i.
- **Compatibility:** Varsayılan 1 → davranış birebir korunur; `status().current` tekil kalır ve dört web sayfası değişmeden çalışır. Sıfır runtime bağımlılığı korunur.
- **Verification:** `npm test` (12 suite); gerçek git deposunda iki görevin üst üste koştuğu ve olay atfının karışmadığı ölçüldü. Ayrıca iki eşzamanlı `codex exec` ayrı dizinlerde başarıyla doğrulandı.
- **Files:** `orchestrator/src/engine.js`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/config.default.json`, `orchestrator/web/index.html`, `orchestrator/web/board.html`, `orchestrator/test/concurrency.test.js`, `package.json`

### 2026-07-25 — Görev başına git worktree izolasyonu eklendi

- **Change:** Yeni `orchestrator/src/worktree.js` ve motor entegrasyonu; görev artık izole bir git worktree içinde çalışıp kendi branch'ine commit'lenebiliyor. Ayrıntı için `worktree.md`.
- **Reason:** Ajanlar kullanıcının çalışma ağacını doğrudan değiştiriyordu; teslimat gözden geçirilebilir bir git nesnesi değildi ve eşzamanlı görev için izolasyon zemini yoktu.
- **Impact:** Yeni bir modül, `config.worktree` şeması, Ayarlar alanları, `delivery.git` sözleşmesi ve bağımsız test suite'i. Uzağa hiçbir şey gönderilmez (push/PR yok).
- **Compatibility:** Varsayılan `mode: "off"` — davranış birebir korunur; git yoksa güvenli geri düşme. Sıfır runtime bağımlılığı ve CommonJS sözleşmesi korunur.
- **Verification:** `npm test` (11 suite); gerçek git deposu üzerinde uçtan uca izolasyon, commit ve geri düşme doğrulandı.
- **Files:** `orchestrator/src/worktree.js`, `orchestrator/src/engine.js`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/config.default.json`, `orchestrator/web/index.html`, `orchestrator/test/worktree.test.js`, `package.json`

### 2026-07-25 — Dışa dönük MCP sunucusu eklendi

- **Change:** Yeni `orchestrator/src/mcp-server.js` ve `crewctl mcp` komutu; CrewCtl artık yalnızca kendi panelinden değil, başka bir kodlama ajanının akışından da kullanılabiliyor. Ayrıntı için `mcp-server.md`.
- **Reason:** Rakiplerin (Vibe Kanban, Conductor OSS) sunduğu "orkestratörün kendisi MCP sunucusu" yönü eksikti; mevcut HTTP API üzerine ince bir kabukla karşılanıyor.
- **Impact:** Yeni bir modül + CLI komutu + `config.mcpServer` şeması + bağımsız test suite'i. Panel, motor ve mevcut API sözleşmeleri değişmedi.
- **Compatibility:** Tamamen additive; sıfır runtime bağımlılığı ve CommonJS sözleşmesi korunur. MCP süreci ayrı çalışır, panel kapalıyken açıklayıcı hata döner.
- **Verification:** `npm test` (on suite); canlı panele karşı el sıkışma + gerçek görev oluşturma doğrulandı; `npm pack --dry-run --json` paket içeriğini onaylar.
- **Files:** `orchestrator/src/mcp-server.js`, `orchestrator/src/cli.js`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/config.default.json`, `orchestrator/test/mcp-server.test.js`, `package.json`

### 2026-07-25 — Doğrulama kapısı katmanı eklendi

- **Change:** Yeni `orchestrator/src/verify.js` modülü ve motor entegrasyonu eklendi; teslimat kararı LLM verdict'ine ek olarak çalıştırılan komut sonucuna bağlandı. Ayrıntı için `verify.md`.
- **Reason:** Kalite döngüsünün tek dayanağı modelin `VERDICT: PASS` beyanıydı; ölçülebilir kanıt katmanı yoktu.
- **Impact:** Yeni bir modül, `config.verify` şeması, Ayarlar → Genel alanları ve bağımsız test suite'i; kapı `verify.commands` boşken tamamen edilgen kalır.
- **Compatibility:** Varsayılan yapılandırmada davranış birebir korunur; sıfır runtime bağımlılığı ve CommonJS sözleşmesi bozulmaz.
- **Verification:** `npm test` (dokuz suite); `npm pack --dry-run --json` (103 dosya, `src/verify.js` dahil, testler hariç).
- **Files:** `orchestrator/src/verify.js`, `orchestrator/src/engine.js`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/config.default.json`, `orchestrator/web/index.html`, `orchestrator/test/verify.test.js`, `package.json`

### 2026-07-18 — Npm paketi sahipli kapsam altına taşındı

- **Change:** Npm paket adı `crewctl` yerine public `@omerrgocmen/crewctl` oldu; `npx` ve global kurulum örnekleri scoped adı kullanıyor, kurulumun oluşturduğu executable adı `crewctl` olarak korunuyor; canonical repo ve clone akışı `omergocmen/CrewCtl` adresine taşındı.
- **Reason:** Unscoped `crewctl` adı başka bir npm sahibinin yayından kaldırılmış kaydıyla kilitli olduğundan sahipli ve çakışmasız bir yayın alanı kullanmak.
- **Impact:** Kurulumsuz çalıştırma komutu `npx @omerrgocmen/crewctl`, global kurulum komutu `npm install -g @omerrgocmen/crewctl` oldu; kurulum sonrası `crewctl` komutları değişmedi.
- **Compatibility:** Eski unscoped paket hiç yayımlanamadı; mevcut yerel `crewctl` executable kullanımı korunur.
- **Verification:** `npm test`; `npm publish --dry-run --access public`; paket metadata ve lock adının `@omerrgocmen/crewctl@1.0.0` olduğunu doğrulama.
- **Files:** `package.json`, `package-lock.json`, `.gitignore`, `README.md`, `orchestrator/README.md`, `CONTRIBUTING.md`, `orchestrator/src/cli.js`, `orchestrator/test/cli.test.js`

### 2026-07-18 — Npm yayın kökü ve ignore sınırları birleştirildi

- **Change:** Tek npm manifesti depo köküne taşındı; `crewctl` bin yolu kökten tanımlandı, kök `.gitignore`/`.npmignore` ve paket `files` allowlist'i eklendi, geliştirme komutları kökten çalışacak şekilde güncellendi.
- **Reason:** Kökten `npm publish`, `npm pack`, `npm link` ve sonrasında `npx crewctl` akışını desteklemek; yerel config, görev geçmişi, test ve agent metadata'sını yayın/Git dışında tutmak.
- **Impact:** Paket sahipleri npm komutlarını artık depo kökünde çalıştırır; tarball yalnızca CLI, web assetleri, varsayılan rol/skill/config ve lisans/dokümantasyon içerir.
- **Compatibility:** Yayımlanan executable adı ve runtime asset yerleşimi korunur; eski `cd orchestrator && npm ...` geliştirme akışı yerine kök dizin kullanılmalıdır.
- **Verification:** `npm test`; `npm pack --dry-run --json` (95 dosya); tarball'ı geçici dizine kurup oluşan `crewctl version` executable'ını çalıştırma (`1.0.0`).
- **Files:** `package.json`, `package-lock.json`, `.gitignore`, `.npmignore`, `orchestrator/src/cli.js`, `orchestrator/test/cli.test.js`, `README.md`, `orchestrator/README.md`

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
