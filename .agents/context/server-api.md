# Server and API Context

**Source:** `orchestrator/src/server.js`

**Last verified:** 2026-07-25

## Purpose

Yerel web sunucusunu, JSON API'yi, SSE olay akışını, CLI sağlık/model keşfini ve statik sayfa sunumunu sağlar.

Sunucu başlangıç banner'ı ürün adını `CrewCtl` olarak, çok-agent orkestratör açıklamasından ayrı gösterir.

## Current API

- `GET /api/events`: `status` ve `queue` snapshot'ıyla başlayan; engine `activity`, `message`, `log`, `result` ve `filechange` olaylarını canlı yayınlayan SSE bağlantısı.
- `GET /api/state`: engine, kuyruk, config, roller, CLI durumları, platform ve mutlak çalışma dizini.
- `POST /api/security/autonomous-consent`: açık otonom çalışma kabulünü kaydeder.
- `GET /api/fs`: güvenli klasör gezinme verisi.
- `POST /api/tasks`; `GET|PUT|DELETE /api/tasks/:id`: görev oluşturma ve yönetimi.
- `POST /api/tasks/:id/approve|reject`, `POST /api/tasks/:id/chat`, `GET /api/tasks/:id/events`.
- `POST /api/cli/discover`, `POST /api/cli/health`, `GET /api/codex/models`, `GET /api/claude/models`.
- `POST /api/engine`; `GET|PUT /api/config`; `GET|PUT|DELETE /api/roles/:file`.

## Contracts and invariants

- API gövdeleri JSON'dur; hata yanıtları en az `error` alanı taşır.
- Görev için seçilen operatör kurulu ve sağlıklı olmalıdır; OpenCode model hazırlığı ayrıca dikkate alınır.
- CLI health cache sürümlüdür; health yürütme sözleşmesi değiştiğinde eski sonuçlar startup'ta agent profillerinden temizlenir ve otomatik yeniden test edilir.
- `PUT /api/config`, eski model alanlarını `cliSettings` şemasına normalize eder; Codex/Claude/OpenCode model alanlarını, Codex effort değerini ve service tier biçimini doğrular.
- `mcpServer` bloğu da ham gövde üzerinde doğrulanır (`allowEngineControl` boolean olmalı).
- `maxConcurrentTasks` 1..8 tam sayı olmalıdır ve **1'den büyükse `worktree.mode` `"task"` olmak zorundadır**; izolasyon olmadan eşzamanlı görev aynı klasörde veri kaybına yol açacağı için istek 400 ile reddedilir.
- `GET /api/state` → `status` artık `currents` (aktif görev listesi), `activeIds` ve `concurrency` alanlarını da taşır; `current` geriye uyum için ilk aktif görevdir. "Çalışan görev silinemez/güncellenemez" korumaları `activeIds` üzerinden tüm slotları kontrol eder.
- `worktree` bloğu ham gövde üzerinde doğrulanır: `mode` yalnızca `off`/`task`, `setupCommands`/`linkPaths` metin dizisi, `setupTimeoutSeconds` ≥10, `commit`/`keepOnFailure` boolean. `linkPaths` içinde mutlak yol veya `..` kaçışı reddedilir (izolasyonu bozar).
- `verify` bloğu `normalizeConfig` çağrısından ÖNCE, ham gövde üzerinde doğrulanır: normalizasyon geçersiz değerleri güvenli varsayılana çevirdiği için normalize sonrası kontrol asla tetiklenmez ve kullanıcı hatası sessizce yutulurdu.
- Yalnızca pending görev düzenlenebilir; aktif görev düzenlenemez veya silinemez.
- Görev hedefi düzenlenince eski plan, approval ve team state geçersizleştirilir.
- Rol dosyası yolları `path.basename` ile `roles/` altına sınırlanır.
- Statik kök `/`, `web/index.html`; `/flow.html`, ayrı ekip akışı sayfasıdır.

## Interactions

Dışa dönük MCP sunucusu (`mcp-server.md`) bu API'nin bir **istemcisidir**: `POST /api/tasks`, `GET /api/tasks/:id`, `GET /api/state` ve `POST /api/engine` uçlarını kullanır. Bu uçların gövde/yanıt şeması değiştiğinde `mcp-server.js` birlikte güncellenmelidir.

`engine` olayları `broadcast()` ile SSE istemcilerine ve kalıcı event store'a aktarılır. Task, config ve role işlemleri `store`; CLI işlemleri `cli-registry` üzerinden yürür.

## Verification

- `cd orchestrator && npm test`
- Endpoint değişikliklerinde dashboard/flow tüketicilerini ve hata kodlarını birlikte kontrol et.

## Major Changes

### 2026-07-25 — Doğrulama kapısı config doğrulaması

- **Change:** `PUT /api/config`, `verify` bloğunun tip ve alt sınırlarını (`commands` metin dizisi, `timeoutSeconds` ≥5, `maxOutputChars` ≥200, `maxAttempts` pozitif tam sayı, `enabled`/`blockOnFailure` boolean) ham gövde üzerinde denetler.
- **Reason:** Kapı ayarını doğrulanmış bir API sözleşmesi yapmak ve normalizasyonun hatalı girdiyi sessizce düzeltmesini engellemek.
- **Impact:** Hatalı tipte kapı ayarı açıklayıcı 400 yanıtı alır; geçerli ayar trim'lenerek kalıcılaşır.
- **Compatibility:** Alan gönderilmezse doğrulama atlanır ve normalizasyon güvenli varsayılanı uygular; mevcut istemciler değişmeden çalışır.
- **Verification:** `node orchestrator/test/server-flow.test.js` (canlı sunucu üzerinde geçerli/geçersiz gövde matrisi).
- **Files:** `orchestrator/src/server.js`, `orchestrator/test/server-flow.test.js`

### 2026-07-24 — Claude Code model kataloğu API'si

- **Change:** `GET /api/claude/models`, Claude Code Agent SDK initialize metadata'sından alınan kullanıcıya özel model listesini beş dakika bellekte tutarak döndürüyor.
- **Reason:** UI'nın sabit ve belirli bir makineye göre hazırlanmış model listesi yerine mevcut hesabın gerçekten desteklediği seçenekleri göstermesi.
- **Impact:** Sağlayıcı, abonelik veya kurum politikası farklı olan kullanıcılar farklı ve doğru katalog görür; hesap metadata'sı yanıta eklenmez.
- **Compatibility:** Yeniden CLI taraması bellek önbelleğini temizler; katalog alınamazsa endpoint 502 ve açıklayıcı `error` döndürür.
- **Verification:** `node orchestrator/test/cli.test.js`, gerçek prompt içermeyen initialize metadata sorgusu ve `npm test`.
- **Files:** `orchestrator/src/server.js`, `orchestrator/src/cli-registry.js`

### 2026-07-24 — Claude model alanı config API doğrulamasına eklendi

- **Change:** `PUT /api/config`, normalize edilen `cliSettings.claude.model` değerinin string olmasını Codex ve OpenCode ile birlikte doğruluyor.
- **Reason:** Claude model seçimini kalıcı config sözleşmesinin doğrulanmış bir parçası yapmak.
- **Impact:** Hatalı tipte Claude model ayarı 400 yanıtıyla reddedilir.
- **Compatibility:** Eksik alan normalizasyonda boş string olur; mevcut istemciler değişmeden çalışır.
- **Verification:** `node orchestrator/test/cli.test.js`, `node orchestrator/test/ui-smoke.test.js`.
- **Files:** `orchestrator/src/server.js`, `orchestrator/src/store.js`

### 2026-07-17 — Filechange SSE sözleşmesi

- **Change:** Engine `filechange` olayları SSE istemcilerine aktarılıyor; kalıcı task event endpoint'i aynı olayları replay için döndürüyor.
- **Reason:** Dashboard'da canlı ve geçmiş görevler için aynı satır diff görünümünü sağlamak.
- **Impact:** Yeni event payload'ı `files`, dosya `counts`, `lineCounts` ve dosya bazlı hunk/önizleme alanları taşır.
- **Compatibility:** Mevcut SSE olayları ve endpoint yolları değişmedi; yeni olay additive'dir.
- **Verification:** `node test/live-diff.test.js`, `node test/ui-smoke.test.js`, `npm test`.
- **Files:** `orchestrator/src/server.js`, `orchestrator/src/engine.js`, `orchestrator/web/index.html`

### 2026-07-14 — Eski hatalı health cache otomatik geçersizleşiyor

- **Change:** Health cache'e sürüm eklendi; eski sürümdeki agent health alanları startup'ta temizlenip seçili CLI config'iyle yeniden hesaplanıyor.
- **Reason:** Düzeltilmiş OpenCode health testine rağmen altı saatlik eski false-negative kaydının agent'ı katalog dışında tutmasını önlemek.
- **Impact:** Sunucu güncellemesi sonrası manuel cache temizliği gerekmez; health sonucu config agent profillerine güncel biçimde yayılır.
- **Compatibility:** Geçerli yeni cache altı saatlik TTL davranışını korur.
- **Verification:** İzole `npm test`, gerçek OpenCode health sonucu `ready` ve mevcut agent health kaydının düzeltilmesi.
- **Files:** `orchestrator/src/server.js`, `orchestrator/src/cli-registry.js`

### 2026-07-14 — Config API yeni CLI ayar şemasını kabul ediyor

- **Change:** Config kaydı `cliSettings` alanlarını doğruluyor ve eski UI gövdelerini kaydetmeden önce normalize ediyor; OpenCode readiness elle seçilmiş global modeli de kabul ediyor.
- **Reason:** Yeni UI ile eski config istemcileri arasında güvenli şema geçişi sağlamak.
- **Impact:** `PUT /api/config`, task oluşturma ve startup readiness kontrolleri etkilendi.
- **Compatibility:** Eski `operator.codexSettings`/`operator.model` gövdeleri desteklenir ve yeni biçimde saklanır.
- **Verification:** İzole kopyada `npm test`; CLI config göçü ve OpenCode readiness regresyonları.
- **Files:** `orchestrator/src/server.js`, `orchestrator/src/store.js`, `orchestrator/test/cli.test.js`
