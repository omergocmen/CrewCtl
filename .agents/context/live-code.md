# Live Code Page Context

**Source:** `orchestrator/web/code.html`

**Last verified:** 2026-07-17

## Purpose

Agentlar çalışırken görev başlangıcından itibaren oluşan dosya değişikliklerini Git-benzeri satır diff'i olarak ayrı, salt-okunur bir sayfada gösterir.

## Current behavior

- `?task=<id>` verilirse açıkça seçilen görevi gösterir; query yoksa `/api/state` içindeki aktif görev ID'sini otomatik kullanır.
- Seçilen görevin task kaydını ve en fazla 1500 geçmiş olayını yükler; son `filechange` olayı toplam dosya/satır görünümünü kurar.
- Geçmiş replay sırasında gelen `status`, `filechange`, `activity`, `log` ve `result` SSE olayları tamponlanır; replay tamamlanınca geçmişte bulunan olaylar tekilleştirilerek kalan canlı olaylar sırasıyla uygulanır.
- Created/modified/deleted dosyalar açılır panellerde hunk başlığı, eski/yeni satır numarası ve ekleme/silme renkleriyle gösterilir.
- Hassas, binary, büyük veya önizleme sınırına takılan içerik için kod yerine güvenli açıklama gösterilir.

## Contracts and invariants

- Sayfa görev veya engine durumunu değiştirmez; yalnızca REST ve SSE verilerini okur.
- Query ile seçilen görev aktif görevden önceliklidir.
- `filechange` payload'ındaki `counts`, `lineCounts`, `files`, `hunks` ve `previewStatus` alanları engine/server sözleşmesidir.
- Geçmiş ve canlı olayların birleşimi yeni bir canlı diff'i daha eski replay verisiyle geri almamalıdır.

## Interactions

`server-api.md` state/task/event-history/SSE uçlarını, `engine.md` filechange üretimini, `dashboard.md` sayfaya geçişi tanımlar.

## Verification

- `cd orchestrator && node test/ui-smoke.test.js`
- `cd orchestrator && npm test`
- İzole sunucuda `/code.html`, `/api/state`, task events ve `/api/events` SSE smoke kontrolü.

## Major Changes

### 2026-07-17 — Aktif görevi otomatik replay

- **Change:** Canlı Kod sayfası `?task` yokken aktif görevi otomatik seçiyor; geçmiş yüklenirken gelen SSE olaylarını tamponlayıp geçmiş olaylarla tekilleştiriyor.
- **Reason:** Ana ekrandan görev ortasında geçildiğinde daha önce oluşmuş dosya değişikliklerinin kaybolmasını ve yeni diff'in eski replay tarafından ezilmesini önlemek.
- **Impact:** Kullanıcı görev ID'si taşımadan Canlı Kod'a geçebilir ve görev başından itibaren güncel diff'i görür.
- **Compatibility:** Açık `?task=<id>` bağlantıları aynı şekilde ve aktif görevden öncelikli çalışır; API/SSE sözleşmesi değişmedi.
- **Verification:** `node test/ui-smoke.test.js`, `npm test`, izole HTTP/SSE smoke testi; in-app tarayıcı Node REPL aracı bu oturumda mevcut değildi.
- **Files:** `orchestrator/web/code.html`, `orchestrator/test/ui-smoke.test.js`
