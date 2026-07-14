# Configuration Context

**Sources:** `orchestrator/config.default.json`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/web/index.html`

**Last verified:** 2026-07-14

## Purpose

Paylaşılabilir varsayılan yapılandırmayı, kişiye özel `config.json` yaşam döngüsünü ve eski config şemalarının normalizasyonunu tanımlar.

## Current behavior

- `store.loadConfig()`, `config.json` yoksa `config.default.json` kopyalar ve sonra saf/idempotent `normalizeConfig()` uygular.
- `cliSettings` doğrulanmış model kataloğu bulunan Codex ve OpenCode için CLI bazlı model ayarlarını tutar; Claude/Gemini CLI varsayılanını kullanır.
- Eski `operator.codexSettings` ve `operator.model` alanları `cliSettings` altına taşınır ve operatör nesnesinden silinir.
- `operator` tur/delegasyon/protokol/kurtarma politikalarını; `agents` uzman profillerini; `riskyPatterns` insan onayı gerektirebilecek metinleri tanımlar.
- Genel ayarlar UI'ı çalışma dizini, onay modu, günlük bütçe, timeout ve context/hafıza bütçelerini düzenler.

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
