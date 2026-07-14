# CLI Registry Context

**Source:** `orchestrator/src/cli-registry.js`

**Last verified:** 2026-07-14

## Purpose

Codex, Claude, Gemini ve OpenCode kurulumlarını keşfeder; agent profillerini normalize eder; model, argüman ve sağlık durumunu yönetir.

## Responsibilities

- Her CLI için komut, sürüm argümanı, varsayılan otonom argümanlar, yetenekler, rol ve timeout metadata'sı tanımlar.
- PATH yanında npm, pnpm, Yarn, Bun, Volta, Scoop, WinGet, Chocolatey, Homebrew ve yaygı Unix konumlarını tarar.
- `effectiveAgent()` ile katalog destekli Codex/OpenCode config model ayarlarını adapter'a özgü CLI argümanlarına dönüştürür; Claude/Gemini modelini CLI varsayılanına bırakır.
- OpenCode'un tüm sağlayıcı model listesini parse eder; erişilebilir modele öncelik verir ve keşfedilmiş ya da elle seçilmiş modeli olmayan OpenCode'u hazır saymaz.
- CLI sağlık promptlarını çalıştırır; auth, model, timeout ve genel hata durumlarını sınıflandırır.
- Health check, normal runtime ile aynı `{PROMPT}`/`{PROMPT_FILE}` materyalizasyonunu ve OpenCode otonom izin ortamını kullanır; geçici prompt dosyasını her çıkış yolunda temizler.
- Otomatik keşfedilen uzmanları config'e ekler; kullanıcının gizlediği adapter'ları geri eklemez ve geçersiz operatörü uygun CLI'a taşır.

## Contracts and invariants

- Bilinen adapter ID'leri `codex`, `claude`, `gemini`, `opencode`'dur; diğer komutlar `custom` olur.
- Bilinen bir CLI adı taşıyan `cmd`, çelişkili `adapter` alanından üstündür; çelişki halinde hedef CLI'nın varsayılan argümanları kurulur ve eski model override'ı temizlenir.
- CLI adı taşımayan özel wrapper komutlarında açıkça verilmiş bilinen adapter korunur.
- Katalog destekli adapter'larda model önceliği açık agent override'ı > `cliSettings[adapter].model` > CLI varsayılanı/otomatik seçimdir.
- Otomatik keşfedilmiş OpenCode profillerindeki eski sistem-önerisi `model`, `modelOverride: true` değilse temizlenir ve global CLI ayarını ezemez.
- CLI çağrıları non-interactive ve otonom olmalı; desteklenmeyen/eski bayraklar temizlenmelidir.
- Windows Unicode kullanıcı yolları ve `.cmd/.bat` çalıştırma davranışı korunmalıdır.
- Codex ve Gemini için adapter sessizlik sınırı 180 saniyedir; genel 300 saniyelik varsayılan Claude'un tamponlanan çıktı davranışı nedeniyle korunur.

## Interactions

`doctor.js` keşif sonuçlarını raporlar; `server.js` keşif, sağlık ve model endpoint'lerini sunar; `engine.js` proses çalıştırmadan önce etkin profili ister; settings UI sonuçları düzenler.

## Verification

- `cd orchestrator && node test/cli.test.js`
- `cd orchestrator && node test/team-flow.test.js`
- Platforma özgü komut değişikliklerinde Windows ve Unix argüman davranışını ayrı kontrol et.

## Major Changes

### 2026-07-14 — OpenCode health check gerçek prompt dosyası kullanıyor

- **Change:** Health check `{PROMPT_FILE}` için geçici dosya oluşturuyor, seçili global model config'ini ve OpenCode izin ortamını uyguluyor, ardından dosyayı temizliyor.
- **Reason:** Literal `{PROMPT_FILE}` yüzünden sağlıklı OpenCode agent'ının `failed` sayılıp operatör kataloğundan çıkarılmasını engellemek.
- **Impact:** Etkin ve gerçekten sağlıklı OpenCode executor/reviewer profilleri yeniden agent kataloğuna girer; gerçek auth/model/timeout hataları filtrelenmeye devam eder.
- **Compatibility:** Prompt'u stdin veya `{PROMPT}` ile alan diğer CLI'lar mevcut davranışını korur.
- **Verification:** Geçici dosya yaşam döngüsü regresyon testi, izole `npm test` ve yerel `opencode-go/mimo-v2.5-pro` gerçek health sonucu `ready`.
- **Files:** `orchestrator/src/cli-registry.js`, `orchestrator/test/cli.test.js`

### 2026-07-14 — Adapter ve komut çelişkileri otomatik onarılıyor

- **Change:** Agent profilleri bilinen `cmd` değerinden normalize ediliyor; başka CLI'ya ait adapter/argüman/model bilgisi güvenli varsayılanlarla değiştiriliyor. Runtime aynı kontrolü kaydedilmemiş eski config için de yapıyor.
- **Reason:** `adapter: claude + cmd: codex` gibi bozuk profillerin Claude'a Codex bayrakları göndermesini tüm bilgisayarlarda engellemek.
- **Impact:** Startup discovery, config kaydı ve her agent çağrısı profil tutarlılığını koruyor; özel wrapper adapter'ları çalışmaya devam ediyor.
- **Compatibility:** Eski çelişkili profiller otomatik göçürülür; CLI adı anlaşılmayan wrapper'larda açık adapter korunur.
- **Verification:** İzole kopyada `npm test`; iki yönlü adapter/cmd çelişkisi, argüman sıfırlama ve wrapper koruma regresyonları.
- **Files:** `orchestrator/src/cli-registry.js`, `orchestrator/src/server.js`, `orchestrator/test/cli.test.js`

### 2026-07-14 — OpenCode mirası gerçek override'dan ayrıldı

- **Change:** Otomatik keşfin yazdığı eski OpenCode modeli temizleniyor; yalnızca `modelOverride: true` ile işaretlenen kullanıcı seçimi global modeli geçersiz kılıyor. Claude/Gemini serbest config modeli artık argümana çevrilmiyor.
- **Reason:** Global OpenCode seçiminin otomatik agent tarafından sessizce ezilmesini ve katalogsuz model adlarının uygulanmasını engellemek.
- **Impact:** OpenCode otomatik profilleri CLI ayarını güvenilir biçimde miras alır; Claude/Gemini CLI varsayılanıyla çalışır.
- **Compatibility:** Açık agent `args` korunur; eski otomatik OpenCode `model` alanı discovery sırasında temizlenir.
- **Verification:** İzole kopyada `npm test`; eski otomatik model temizliği, açık override koruması ve katalogsuz adapter argüman testleri.
- **Files:** `orchestrator/src/cli-registry.js`, `orchestrator/test/cli.test.js`

### 2026-07-14 — Global CLI modeli ve tam OpenCode sağlayıcı keşfi

- **Change:** `effectiveAgent(agent, cfg)` dört adapter için global CLI modelini ve agent override'ını uygular; OpenCode keşfi sağlayıcı filtresi olmadan tüm `provider/model` satırlarını okur.
- **Reason:** Uzmanların da seçilen CLI modelini kullanması ve ücretli OpenCode sağlayıcılarının yanlışlıkla görünmez/hazır değil sayılmaması.
- **Impact:** Operatör ve uzman komut argümanları, OpenCode readiness, otomatik agent oluşturma ve sessizlik timeout'ları değişti.
- **Compatibility:** `cfg` parametresi opsiyoneldir; mevcut `effectiveAgent(agent)` çağrıları çalışmaya devam eder. Agent modeli global modeli geçersiz kılar.
- **Verification:** İzole kopyada `npm test`; parser, öncelik, argüman tekrarını önleme ve elle seçilmiş OpenCode modeli testleri.
- **Files:** `orchestrator/src/cli-registry.js`, `orchestrator/test/cli.test.js`
