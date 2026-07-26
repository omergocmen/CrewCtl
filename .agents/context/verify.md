# Verification Gate Context

**Sources:** `orchestrator/src/verify.js`, `orchestrator/src/engine.js` (kapı entegrasyonu), `orchestrator/config.default.json`

**Last verified:** 2026-07-25

## Purpose

Teslimat kalitesini modelin `VERDICT: PASS` kanaatinden çıkarıp **çalıştırılan kanıta** bağlar. Kullanıcının tanımladığı komutlar (`npm test`, `npx tsc --noEmit`, lint) her turun sonunda çalışma klasöründe gerçekten koşulur; kapı kırmızıysa hiçbir tamamlama kestirmesi teslimatı kapatamaz ve başarısız komut çıktısı operatöre kanıt olarak verilir.

## Responsibilities

- `normalizeVerifyConfig(cfg)`: saf ve idempotent şema normalizasyonu; geçersiz değerler güvenli varsayılana düşer.
- `isActive(cfg)`: kapı etkin mi (enabled **ve** en az bir komut).
- `runCommand(command, opts)`: tek komutu shell üzerinden çalışma klasöründe koşar; stdout+stderr birleşik yakalanır, zaman aşımında proses ağacı sonlandırılır.
- `runVerification(commands, opts)`: komutları sırayla koşar ve **ilk başarısızlıkta durur** (fail-fast).
- `summarize(report)`: `delivery.verification` için tek satırlık özet.
- `reportForPrompt(report, limit)`: operatörün sonraki turda göreceği kanıt bloğu.
- `clipMiddle(text, limit)`: baş ve sonu koruyarak kırpar (test özetleri çıktının sonundadır).

## Contracts and invariants

- **Opt-in:** `verify.commands` boşken motor hiçbir şey çalıştırmaz ve davranış önceki sürümle birebir aynıdır. Eski `config.json` yükseltildiğinde kapı KAPALI kalır.
- Modül komut çalıştırır fakat motor durumunu bilmez; "hangi anda koşar, kırmızı kapıda ne olur" kuralları `engine.js`'tedir.
- Komutlar `CI=1`, `FORCE_COLOR=0`, `NO_COLOR=1` ile koşulur: test koşucularının watch/interaktif moda girip kapıyı süresiz asılı bırakmasını önler ve çıktıyı ANSI kodlarından arındırır.
- Komut çıktısı bellekte `maxOutputChars * 8` ile sınırlıdır; rapora giren metin `maxOutputChars` ile ortadan kırpılır.
- Kapı gorevi ASLA öldürmez: kırmızı kapı `maxAttempts` kadar teslimatı engeller, sonra iş çöpe atılmaz ve yüksek sesli uyarıyla teslim edilir ("teslimat > mükemmeliyet").
- `blockOnFailure: false` kapıyı rapor-only yapar; kanıt kaydedilir, teslimat engellenmez.

## Engine integration

Kapı, round döngüsünde `runAssignments` sonrası **tek bir noktada** çalışır (`engine.runVerifyGate`) ve bütün "bitti" kararlarından öncedir:

- Atlanır: komut yok (`disabled`) **veya** çalışma klasöründe hiç değişiklik yok (`no-changes` — araştırma/plan görevlerinde test koşmak boşunadır).
- Kırmızı kapı üç kestirmeyi de bastırır: FAST mod erken tamamlama, PASS hızlı yolu ve inceleme döngüsü valisi. Karar operatöre gider; kanıt `operatorPrompt` içindeki `## Dogrulama kapisi` bloğuyla iletilir.
- Operatör kırmızı kapıya rağmen `complete` derse ve `verifyStillBlocking()` doğruysa motor bir kez düzeltme turu ister (plan düzeltmesiyle aynı desen). Deneme hakkı bitince uyarılı teslimat yapılır.
- Kapı etkinken operatör protokolüne "kapı kırmızıysa complete dönme; testi silmek/atlamak çözüm değildir" kuralı eklenir.
- `salvage()` (hata yolu) kapıyı YENİDEN koşmaz; kesintinin nedeni kapının kendisi olabilir. Varsa son turun raporu kanıt olarak korunur.
- `complete()` içinde çalıştırılan kanıt, modelin kendi `verification` beyanından önceliklidir; yapılandırılmış rapor `delivery.verify` alanına yazılır (ham çıktı yalnızca başarısız komutta ve kırpılmış halde).

## Configuration

`config.verify`: `enabled`, `commands[]`, `timeoutSeconds` (≥5), `maxOutputChars` (≥200), `blockOnFailure`, `maxAttempts` (≥1). Ayrıntı için `configuration.md`; UI için `settings.md`.

## Known limitations

- Doğrulama komutunun ürettiği yapıtlar (coverage/, build çıktısı) kapı `complete()`'ten önce koştuğu için teslimatın değişen dosya listesinde görünebilir; snapshot yürüyücüsü gitignore'a duyarlı değildir.
- Komut önerisi/otomatik tespiti yoktur; kullanıcı komutu Ayarlar → Genel'den kendisi yazar.
- Kapı sonucu için ayrı bir SSE olay tipi yoktur; canlı akışa `log` olaylarıyla, teslimata `delivery.verify` ile yansır.

## Verification

- `cd orchestrator && node test/verify.test.js`
- `cd orchestrator && node test/server-flow.test.js` (config sözleşmesi)
- `npm test`

## Major Changes

### 2026-07-25 — Doğrulama kapısı eklendi

- **Change:** Yeni `src/verify.js` modülü, `engine.runVerifyGate` entegrasyonu, `config.verify` şeması, `/api/config` ham gövde doğrulaması, Ayarlar → Genel alanları ve `test/verify.test.js` (birim + uçtan uca) eklendi.
- **Reason:** Teslimat kalitesinin tek dayanağı LLM'in `VERDICT: PASS` kanaatiydi; ölçülebilir bir kapı yoktu.
- **Impact:** Kapı etkinken kırmızı sonuç FAST/PASS/vali kestirmelerini bastırır, kanıtı operatöre besler ve `delivery.verify` ile kullanıcıya taşır.
- **Compatibility:** `commands` boşken (varsayılan) davranış birebir korunur; mevcut config'ler migration gerektirmez.
- **Verification:** `npm test` (9 suite yeşil); yeşil/kırmızı kapı uçtan uca senaryoları sahte CLI ile doğrulandı.
- **Files:** `orchestrator/src/verify.js`, `orchestrator/src/engine.js`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/config.default.json`, `orchestrator/web/index.html`, `orchestrator/test/verify.test.js`, `orchestrator/test/server-flow.test.js`, `orchestrator/test/ui-smoke.test.js`, `package.json`
