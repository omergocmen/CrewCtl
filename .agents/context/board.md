# Board (Kanban Pano) Context

**Source:** `orchestrator/web/board.html`

**Last verified:** 2026-07-18

## Purpose

Görev yaşam döngüsünü tek bakışta gösteren salt-görsel Kanban panosu. Kuyruğun dikey liste
yerine sütunlar halinde okunmasını sağlar.

## Current behavior

- Sütunlar: `Bekleyen · Çalışıyor · Tamamlanan · Başarısız` (4 sütun). Onay sütunu kaldırıldı —
  görsel arayüzde yalnızca `auto` mod kullanılıyor; `ask` moda geçilirse onay bekleyen görevler
  dashboard'daki `#approvalCard`'da görünmeye devam eder.
- **Çalışıyor** sütunu `status.current`'ten türetilir; aynı id `pending` içinde varsa oradan
  çıkarılır (çalışan görev iki sütunda görünmez).
- Açılışta `GET /api/state` (queue + status + schedules); sonra SSE `/api/events` üzerinden
  `status`, `queue`, `schedules` olaylarını dinleyip yeniden render eder.
- Kart eylemleri mevcut API'lerle: `pending`→Sil (`DELETE /api/tasks/:id`), `done`/`failed`→dosya
  değişikliği varsa "Kodu gör" (`code.html?task=:id`).
- `task.scheduleId` taşıyan görevler "⏱ zamanlanmış" rozetiyle işaretlenir.
- Üstte salt-okunur "Yaklaşan zamanlanmış görevler" şeridi `schedules`'tan beslenir; boşsa gizli.

## Contracts and invariants

- Salt-görsel: sürükle-bırak yok, yeni `priority`/`order` alanı yok; motorun durum geçişleri
  otomatiktir. Backend'e yeni bağımlılık getirmez, mevcut task/queue/SSE sözleşmesini tüketir.
- Kendi `:root`/`[data-theme=light]` token bloğunu taşır ve `app.css`/`app.js` cila katmanını
  yükler (flow.html/code.html ile aynı desen). Yalnızca `var(--*)` token'ları kullanır.
- İnline script sözdizimi `ui-smoke.test.js` içinde `new Function` ile doğrulanır.

## Interactions

`server.js` `/api/state` + SSE (`queue`/`status`/`schedules`) sağlar; `index.html` header'ından
"Pano" butonuyla açılır; kart eylemleri `store`/`engine` durumunu değiştirmeden mevcut task
API'lerini çağırır.

## Verification

- `cd orchestrator && node test/ui-smoke.test.js` (sütun id'leri, olay listesi, render fonksiyonu).
- Manuel: `npm start` → Pano; görev ekle/başlat, sütunlar arası ilerlemeyi ve açık/koyu temayı gör.

## Major Changes

### 2026-07-18 — Onay sütunu kaldırıldı

- **Change:** Pano beş sütundan dörde indi; `Onay` sütunu ve ona bağlı `decide()`/approval kart
  eylemi çıkarıldı, grid `repeat(4,...)` oldu.
- **Reason:** Görsel arayüzde yalnızca `auto` mod kullanılıyor; onay kuyruğu pratikte boş kalıyordu.
- **Impact:** Approval görevleri (varsa) yalnızca dashboard `#approvalCard`'ında görünür; Pano
  akışı sadeleşti.
- **Compatibility:** Backend değişmedi; `ask` moda geçilirse onay davranışı dashboard'da korunur.
- **Verification:** `npm test`; ui-smoke `col-approval` yokluğunu ve 4 sütunu doğrular.
- **Files:** `orchestrator/web/board.html`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-18 — Kanban Pano eklendi

- **Change:** Görev yaşam döngüsünü beş sütunda gösteren `board.html` sayfası ve dashboard'da
  "Pano" gezinme butonu eklendi.
- **Reason:** Kuyruğun daha anlaşılır, tek bakışta izlenebilir bir görünümünü sunmak.
- **Impact:** Yeni salt-okunur sayfa; mevcut `/api/state` ve SSE olaylarını tüketir, backend
  değişmez.
- **Compatibility:** Additive; index.html'e yalnızca bir buton eklendi, kuyruk mantığı korunur.
- **Verification:** `npm test`; ui-smoke pano assertion'ları ve manuel UI kontrolü.
- **Files:** `orchestrator/web/board.html`, `orchestrator/web/index.html`, `orchestrator/test/ui-smoke.test.js`
