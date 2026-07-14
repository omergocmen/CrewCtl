# Dashboard Context

**Source:** `orchestrator/web/index.html`

**Last verified:** 2026-07-14

## Purpose

Motor durumunu, yeni görev oluşturmayı, kuyrukları, aktif ekip haritasını, birleşik olay akışını ve canlı CLI terminallerini tek sayfada sunan ana web arayüzüdür.

## Current behavior

- Tarayıcı başlığı ve header ürün adını `CrewCtl` olarak gösterir; “Command Center” arayüzün açıklayıcı suffix'idir.
- Header engine durumu, aktif agent, günlük çağrı bütçesi, onay modu, başlat/durdur, flow/settings ve tema kontrollerini taşır.
- İlk otonom engine başlatmada kalıcı consent modalı gösterilir.
- Görev alanı ve kuyruk sol sütunda; misyon, ekip haritası, feed ve teknik terminaller sağ sütundadır.
- `/api/events` SSE olayları `status`, `queue`, `activity`, `message`, `log` ve `result` handler'larına dağıtılır.
- CLI prosesleri için başlama, ilerleme, stdout/stderr, timeout, sessizlik timeout ve bitiş durumları görselleştirilir.
- Tema tercihi `localStorage` içinde saklanır.

## Contracts and invariants

- UI framework kullanmaz; HTML, CSS ve JavaScript tek dosyada inline tutulur.
- Dinamik kullanıcı/CLI metinleri `esc()` ile HTML'e aktarılır.
- SSE olay adları ve payload alanları `server.js`/`engine.js` ile ortak sözleşmedir.
- Ham terminal çıktısı ikincil, katlanabilir alanda kalır; kullanıcı dostu durum özeti birincil gösterimdir.

## Interactions

Görevler için `tasks.md`, ayarlar için `settings.md`, klasör seçici için `filesystem-picker.md`, tamamlanan görev sohbeti için `operator-chat.md`, ayrı görselleştirme için `team-flow.md` context'lerine bak.

## Verification

- `cd orchestrator && node test/ui-smoke.test.js`
- Görsel veya etkileşimli değişiklikte yerel sunucuda dashboard'u ve responsive davranışı canlı kontrol et.

## Major Changes

### 2026-07-14 — Sessiz kalan CLI mesajı ilerlemeyi doğru anlatıyor

- **Change:** Dashboard, silence timeout durumunda agent'ın daha önce ürettiği çıktıyı yok saymadan “uzun süre yeni çıktı gelmedi” açıklamasını gösteriyor.
- **Reason:** OpenCode'un araç kullanıp ilerledikten sonra sağlayıcı/model adımında sessiz kalması, eski “hiç ilerleme üretmedi” mesajını yanıltıcı yapıyordu.
- **Impact:** Ham çıktı korunur ve kullanıcı kurulum hatasıyla son adım beklemesini ayırt edebilir.
- **Compatibility:** SSE olayları ve timeout davranışı değişmedi.
- **Verification:** `node test/ui-smoke.test.js` ve gerçek OpenCode JSON akış kaydı.
- **Files:** `orchestrator/web/index.html`, `orchestrator/src/engine.js`
