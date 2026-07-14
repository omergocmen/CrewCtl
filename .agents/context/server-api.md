# Server and API Context

**Source:** `orchestrator/src/server.js`

**Last verified:** 2026-07-14

## Purpose

Yerel web sunucusunu, JSON API'yi, SSE olay akışını, CLI sağlık/model keşfini ve statik sayfa sunumunu sağlar.

Sunucu başlangıç banner'ı ürün adını `CrewCtl` olarak, çok-agent orkestratör açıklamasından ayrı gösterir.

## Current API

- `GET /api/events`: `status` ve `queue` snapshot'ıyla başlayan SSE bağlantısı.
- `GET /api/state`: engine, kuyruk, config, roller, CLI durumları, platform ve mutlak çalışma dizini.
- `POST /api/security/autonomous-consent`: açık otonom çalışma kabulünü kaydeder.
- `GET /api/fs`: güvenli klasör gezinme verisi.
- `POST /api/tasks`; `GET|PUT|DELETE /api/tasks/:id`: görev oluşturma ve yönetimi.
- `POST /api/tasks/:id/approve|reject`, `POST /api/tasks/:id/chat`, `GET /api/tasks/:id/events`.
- `POST /api/cli/discover`, `POST /api/cli/health`, `GET /api/codex/models`.
- `POST /api/engine`; `GET|PUT /api/config`; `GET|PUT|DELETE /api/roles/:file`.

## Contracts and invariants

- API gövdeleri JSON'dur; hata yanıtları en az `error` alanı taşır.
- Görev için seçilen operatör kurulu ve sağlıklı olmalıdır; OpenCode model hazırlığı ayrıca dikkate alınır.
- CLI health cache sürümlüdür; health yürütme sözleşmesi değiştiğinde eski sonuçlar startup'ta agent profillerinden temizlenir ve otomatik yeniden test edilir.
- `PUT /api/config`, eski model alanlarını `cliSettings` şemasına normalize eder; dört model alanını, Codex effort değerini ve service tier biçimini doğrular.
- Yalnızca pending görev düzenlenebilir; aktif görev düzenlenemez veya silinemez.
- Görev hedefi düzenlenince eski plan, approval ve team state geçersizleştirilir.
- Rol dosyası yolları `path.basename` ile `roles/` altına sınırlanır.
- Statik kök `/`, `web/index.html`; `/flow.html`, ayrı ekip akışı sayfasıdır.

## Interactions

`engine` olayları `broadcast()` ile SSE istemcilerine ve kalıcı event store'a aktarılır. Task, config ve role işlemleri `store`; CLI işlemleri `cli-registry` üzerinden yürür.

## Verification

- `cd orchestrator && npm test`
- Endpoint değişikliklerinde dashboard/flow tüketicilerini ve hata kodlarını birlikte kontrol et.

## Major Changes

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
