# Configuration Context

**Sources:** `orchestrator/config.default.json`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/web/index.html`

**Last verified:** 2026-07-24

## Purpose

Paylaşılabilir varsayılan yapılandırmayı, kişiye özel `config.json` yaşam döngüsünü ve eski config şemalarının normalizasyonunu tanımlar.

## Current behavior

- **Veri/asset ayrımı:** `store.ASSETS` paket dizinidir (salt-okunur: `web/`, `config.default.json`,
  varsayılan `roles/`+`skills/`). `store.ROOT` yazılabilir veri köküdür (config.json, queue/, state/,
  memory/, kullanıcının roles/+skills/). ROOT önceliği: `CLI_TEAM_ROOT` > `CREWCTL_HOME` > mod tespiti
  (`test/` varsa geliştirme kopyası → ROOT=ASSETS; yoksa kurulu paket → `~/.crewctl`). `store.WORK_BASE`
  (=cwd) çalışma/hedef klasör çözümleme tabanıdır. `ensureDirs`, ROOT≠ASSETS iken boş `roles/`+`skills/`'i
  ASSETS varsayılanlarından bir kez seed eder.
- `store.loadConfig()`, `config.json` yoksa `ASSETS/config.default.json`'ı kopyalar ve sonra saf/idempotent `normalizeConfig()` uygular.
- `cliSettings` Codex, Claude Code ve OpenCode için CLI bazlı model ayarlarını tutar; Claude boş modelde hesap varsayılanını, seçili modelde kullanıcının Claude Code oturum kataloğundan gelen kimliği `--model` ile kullanır. Gemini CLI varsayılanını kullanır.
- Eski `operator.codexSettings` ve `operator.model` alanları `cliSettings` altına taşınır ve operatör nesnesinden silinir.
- `operator` tur/delegasyon/protokol/kurtarma politikalarını; `agents` uzman profillerini; `riskyPatterns` insan onayı gerektirebilecek metinleri tanımlar.
- Genel ayarlar UI'ı çalışma dizini, onay modu, günlük bütçe, timeout ve context/hafıza bütçelerini düzenler.
- `liveDiff` canlı dosya olaylarını açıp kapatır; `liveDiffIntervalMs` çalışma klasörü tarama aralığını belirler ve engine en az 500 ms uygular.
- `mcp` içe dönük MCP'yi tanımlar: `enabled` (varsayılan `false`), `mode` (`strict`|`inherit`), `maxServersPerAssignment` (1..8, varsayılan 2), `startupTimeoutMs`, `servers{}`. Her sunucu: `command`|`url`, `args`, `env`, `kinds`, `agents`, `write`, `enabled`, `description`. Normalizasyon `mcp.js`'te; geçersiz sunucu girişi sessizce düşürülür, API katmanı ise 400 döner. Ayrıntı: `mcp-inbound.md`.
- `maxConcurrentTasks` (1..8, varsayılan 1) aynı anda yürütülecek görev sayısıdır. 1'den büyük değer **`worktree.mode: "task"` gerektirir**; API bunu doğrular ve aksi hâlde 400 döner. Ayrıntı: `concurrency.md`.
- `worktree` görev başına git worktree izolasyonunu tanımlar: `mode` (`off`|`task`), `branchPrefix`, `setupCommands[]`, `linkPaths[]` (mutlak yol ve `..` kaçışı temizlenir), `commit`, `keepOnFailure`, `setupTimeoutSeconds` (≥10). Varsayılan `off`; davranış değişmez. Ayrıntı: `worktree.md`.
- `mcpServer.allowEngineControl` dışa dönük MCP sunucusunda motor başlat/durdur aracını açar; varsayılan `false` ve normalizasyon geçersiz/eksik değeri güvenli tarafa (false) düşürür. Ayrıntı: `mcp-server.md`.
- `verify` doğrulama kapısını tanımlar: `commands[]` boşken kapı kapalıdır (opt-in). `timeoutSeconds` (≥5), `maxOutputChars` (≥200), `blockOnFailure` ve `maxAttempts` (≥1) normalizasyonda güvenli varsayılanlara düşer; komutlar trim'lenip boş olanlar atılır. Davranış için `verify.md`.

## Contracts and invariants

- `config.default.json` paylaşılabilir şablondur; `config.json` makineye özeldir ve commit edilmez.
- `operator.roleFile` sunucu tarafında `roles/operator.md` olarak sabitlenir.
- En az bir uzman agent, geçerli bir `operator.cli`, her agent için string `cmd` ve array `args` gerekir.
- Bilinen agent `cmd` değeriyle `adapter` çelişirse config kaydı ve startup keşfi profili komuta göre normalize eder.
- Config şeması değiştirildiğinde `FALLBACK_CONFIG`, `config.default.json`, normalizasyon, server doğrulaması, settings UI ve testler birlikte ele alınmalıdır.

## Interactions

`store.js` config'i üretir ve saklar; `server.js` API gövdelerini doğrular; `cli-registry.js` etkin agent argümanlarını oluşturur; `engine.js` runtime politikalarını okur; settings UI config'i düzenler.

## Verification

- `cd orchestrator && npm test`
- Settings kaydetme için `/api/config` doğrulamasını ve eski şema normalizasyonunu kontrol et.

## Major Changes

### 2026-07-25 — `worktree` şeması eklendi

- **Change:** `worktree` bloğu paylaşılabilir şablona, `FALLBACK_CONFIG`'e ve `normalizeConfig`'e eklendi; `PUT /api/config` mode/dizi/sınır kontrollerini ham gövde üzerinde yapar ve `linkPaths` içinde mutlak yol ile `..` kaçışını reddeder.
- **Reason:** İzolasyon davranışının doğrulanmış ve taşınabilir bir config sözleşmesi olması; bağlı yolların çalışma ağacı dışına taşmasını engellemek.
- **Impact:** Geçersiz mode veya yol 400 ile reddedilir; kurulum komutları trim'lenerek saklanır.
- **Compatibility:** Alan yoksa `mode: "off"` eklenir ve davranış değişmez.
- **Verification:** `node orchestrator/test/worktree.test.js`, `node orchestrator/test/server-flow.test.js`.
- **Files:** `orchestrator/config.default.json`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/src/worktree.js`

### 2026-07-25 — `mcpServer` şeması eklendi

- **Change:** `mcpServer.allowEngineControl` paylaşılabilir şablona, `FALLBACK_CONFIG`'e ve `normalizeConfig`'e eklendi; `PUT /api/config` tipini doğrular.
- **Reason:** Harici bir MCP istemcisinin motoru başlatma yetkisinin açık ve kalıcı bir tercih olması.
- **Impact:** Değer `true` olmadıkça `crewctl_engine_control` aracı MCP kataloğunda görünmez.
- **Compatibility:** Alan yoksa `false` eklenir; mevcut config'ler migration gerektirmez.
- **Verification:** `node orchestrator/test/mcp-server.test.js` (kapalı/açık katalog ve çağrı davranışı).
- **Files:** `orchestrator/config.default.json`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/src/mcp-server.js`

### 2026-07-25 — Doğrulama kapısı şemaya eklendi

- **Change:** `verify` bloğu paylaşılabilir şablona, `FALLBACK_CONFIG`'e ve `normalizeConfig`'e eklendi; `PUT /api/config` bu bloğu **ham gövde** üzerinde doğrular.
- **Reason:** Kapı ayarlarının kalıcı config sözleşmesinin doğrulanmış bir parçası olması.
- **Impact:** Geçersiz tip 400 ile reddedilir; geçerli değerler trim'lenerek saklanır. Normalizasyon her yüklemede şemayı garanti eder.
- **Compatibility:** Alan yoksa `commands: []` ile eklenir ve kapı KAPALI kalır; mevcut config'ler migration gerektirmez.
- **Verification:** `node orchestrator/test/verify.test.js`, `node orchestrator/test/server-flow.test.js`.
- **Files:** `orchestrator/config.default.json`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/src/verify.js`, `orchestrator/web/index.html`

### 2026-07-24 — Claude Code model ayarı şemaya eklendi

- **Change:** `cliSettings.claude.model` paylaşılabilir, fallback ve normalize edilmiş config şemasına eklendi; arayüz kullanılabilir modelleri Claude Code oturumundan dinamik alıyor, config API alanın string olmasını doğruluyor.
- **Reason:** Claude Code operatör ve uzman çağrılarında arayüzden seçilen ortak modeli güvenli biçimde saklamak.
- **Impact:** Mevcut `cliSettings.claude.model` değerleri artık temizlenmek yerine korunur ve runtime'a uygulanır.
- **Compatibility:** Alan yoksa boş değer eklenir ve Claude Code hesap varsayılanı değişmeden kalır.
- **Verification:** `node orchestrator/test/cli.test.js`, `node orchestrator/test/ui-smoke.test.js`.
- **Files:** `orchestrator/config.default.json`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/web/index.html`

### 2026-07-17 — Canlı diff çalışma ayarları

- **Change:** Paylaşılabilir ve fallback config'e varsayılan açık `liveDiff` ile 2500 ms `liveDiffIntervalMs` eklendi.
- **Reason:** Canlı kodlama taramasını kurulumlar arasında tutarlı ve gerektiğinde devre dışı bırakılabilir yapmak.
- **Impact:** Engine görev sırasında periyodik salt-okunur workspace taraması başlatır.
- **Compatibility:** Alanlar bulunmazsa aynı varsayılanlar uygulanır; mevcut config dosyaları migration gerektirmez.
- **Verification:** `node test/live-diff.test.js`, `npm test`.
- **Files:** `orchestrator/config.default.json`, `orchestrator/src/store.js`, `orchestrator/src/engine.js`

### 2026-07-14 — Bozuk agent profilleri taşınabilir biçimde onarılıyor

- **Change:** Config kaydı ve startup, bilinen CLI komutlarında adapter/argüman çelişkisini otomatik düzeltir.
- **Reason:** Bir bilgisayarda oluşmuş eski veya elle düzenlenmiş profil başka bilgisayarda yanlış CLI yürütmesin.
- **Impact:** Persist edilen agent adapter'ları gerçek komutla eşleşir; uyumsuz CLI argümanları taşınmaz.
- **Compatibility:** Özel wrapper komutlarında açık adapter korunur; bilinen CLI çelişkilerinde hedef CLI varsayılanlarına güvenli göç yapılır.
- **Verification:** İzole kopyada `npm test` ve mevcut `Codex-planner` profilinin etkin komut/argüman kontrolü.
- **Files:** `orchestrator/src/cli-registry.js`, `orchestrator/src/server.js`

### 2026-07-14 — Katalogsuz model alanları kaldırıldı

- **Change:** `cliSettings` şeması Claude/Gemini serbest metin modellerini bırakıp yalnızca katalog destekli Codex/OpenCode ayarlarını saklıyor.
- **Reason:** Doğrulanmamış model adlarının görünmez veya geçersiz runtime argümanlarına dönüşmesini ve her yeni CLI için el yazısı seçenek listesi bakımını önlemek.
- **Impact:** Claude/Gemini model seçimi CLI varsayılanına döndü; açık `args` kullanan ileri seviye profiller etkilenmez.
- **Compatibility:** Eski `cliSettings.claude/gemini` alanları normalizasyonda kaldırılır.
- **Verification:** İzole kopyada `npm test`; katalogsuz model enjeksiyonunun yapılmadığını doğrulayan CLI testi.
- **Files:** `orchestrator/config.default.json`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/src/cli-registry.js`

### 2026-07-14 — Model ayarları CLI bazlı şemaya taşındı

- **Change:** Codex, Claude, Gemini ve OpenCode model tercihleri `operator` altından çıkarılarak `cliSettings` altında toplandı; normalizasyon eski alanları saf ve idempotent biçimde yeni şemaya taşıyor.
- **Reason:** Aynı CLI'nın operatör ve uzman kullanımlarında tek, tutarlı model politikası uygulamak.
- **Impact:** Config şeması, settings UI, server doğrulaması ve CLI argüman üretimi birlikte değişti.
- **Compatibility:** Eski `operator.codexSettings` ve `operator.model` gövdeleri yükleme/kaydetme yolunda otomatik göçürülür.
- **Verification:** İzole kopyada `npm test`; `normalizeConfig` saflık, göç ve idempotentlik regresyon testleri.
- **Files:** `orchestrator/config.default.json`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/web/index.html`
