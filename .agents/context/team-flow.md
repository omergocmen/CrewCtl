# Team Flow Page Context

**Source:** `orchestrator/web/flow.html`

**Last verified:** 2026-07-14

## Purpose

Operatörün ekip kurma ve delegasyon akışını, agent filosunu, aktif/geçmiş işleri ve kronolojik olayları ayrı bir canlı görselleştirme sayfasında sunar.

## Current behavior

- Üst KPI'lar operatör, tur, delegasyon, aktif agent, değişen dosya ve çağrı sayısını gösterir.
- Sol panel config'deki etkin agent filosunu; orta stage operatör çekirdeğini ve aktif/geçmiş delegasyon kartlarını; sağ panel zaman çizelgesini gösterir.
- `message` olayları delegation/result/failure/blocked durumlarını ve operatör-agent pulse animasyonunu üretir.
- `activity` olayları proses durumu ve kısa canlı çıktıyı; `log` görev başlangıcı/hatasını; `result` final KPI'larını günceller.
- İlk yüklemede aktif veya en son done/failed task'in kayıtlı olayları yeniden oynatılır, ardından SSE canlı akışı devam eder.

## Contracts and invariants

- Sayfa salt-okunur gözlem yüzeyidir; engine veya task state mutasyonu yapmaz.
- Assignment ID, agent node'larını ve olayları birleştiren anahtardır.
- Server/engine SSE olay adı ve payload değişiklikleri bu sayfayla birlikte güncellenmelidir.
- Responsive SVG bağlantıları pencere boyutunda yeniden çizilir.

## Interactions

`server-api.md` SSE ve event-history endpoint'lerini; `engine.md` olay üretimini; `dashboard.md` aynı olayların ana sayfadaki alternatif sunumunu tanımlar.

## Verification

- `cd orchestrator && node test/ui-smoke.test.js`
- Yerel sunucuda aktif görev, yeniden oynatma, delegation/result/failure ve resize davranışlarını kontrol et.

## Major Changes

Henüz kayıt yok.
