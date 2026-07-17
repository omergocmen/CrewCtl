# Dashboard Context

**Source:** `orchestrator/web/index.html`

**Last verified:** 2026-07-17

## Purpose

Motor durumunu, yeni görev oluşturmayı, kuyrukları, aktif ekip haritasını, birleşik olay akışını ve canlı CLI terminallerini tek sayfada sunan ana web arayüzüdür.

## Current behavior

- Tarayıcı başlığı ve header ürün adını `CrewCtl` olarak gösterir; “Command Center” arayüzün açıklayıcı suffix'idir.
- Header engine durumu, aktif agent, günlük çağrı bütçesi, onay modu, başlat/durdur, ekip akışı/canlı kod/settings ve tema kontrollerini taşır.
- İlk otonom engine başlatmada kalıcı consent modalı gösterilir.
- Görev alanı ve kuyruk sol sütunda; misyon, ekip haritası, feed ve teknik terminaller sağ sütundadır.
- Dashboard açılışta aktif görevin olay geçmişini otomatik replay eder; aktif görev yoksa en son tamamlanan veya başarısız görev geri yüklenir. Bootstrap sırasında gelen SSE olayları replay bitene kadar tamponlanır ve yinelenmeden uygulanır.
- `/api/events` SSE olayları dashboard içinde `status`, `queue`, `activity`, `message`, `log` ve `result` handler'larına dağıtılır.
- CLI prosesleri için başlama, ilerleme, stdout/stderr, timeout, sessizlik timeout ve bitiş durumları görselleştirilir.
- Canlı kodlama görünümü ayrı `code.html` sayfasındadır; dashboard header'ından açılır.
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

### 2026-07-17 — Dashboard dönüşünde otomatik akış replay

- **Change:** Dashboard, sayfa açılışında aktif görevi; aktif görev yoksa en son sonuçlanan görevi otomatik olarak olay geçmişinden yeniden çizer. Replay sırasında gelen canlı SSE olayları tamponlanıp geçmiş olaylarla tekilleştirilir.
- **Reason:** Ekip Akışı veya Canlı Kod sayfasından dönüldüğünde agent kartları ve birleşik akışın boş görünmesini önlemek.
- **Impact:** Kullanıcının “Akışı incele” düğmesine basması gerekmez; manuel inceleme aynı ortak replay fonksiyonunu kullanmaya devam eder.
- **Compatibility:** SSE ve `/api/tasks/:id/events` sözleşmeleri değişmedi.
- **Verification:** `node test/ui-smoke.test.js`, `npm test`; in-app tarayıcı REPL aracı bu oturumda mevcut değildi.
- **Files:** `orchestrator/web/index.html`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-17 — Git-benzeri canlı kod görünümü

- **Change:** Basit değişen-dosya listesi, açılır dosya panelleri içinde `@@` hunk başlıkları, satır numaraları ve `+`/`−` kod satırları gösteren diff görünümüne dönüştürüldü.
- **Reason:** Kullanıcının agent çalışırken yalnızca dosya adlarını değil, eklenen ve kaldırılan kodu doğrudan görebilmesi.
- **Impact:** Canlı ve replay edilmiş `filechange` olayları aynı renderer'ı kullanır; binary, büyük, kısıt nedeniyle alınmayan ve hassas dosyalar açıklayıcı güvenli durum gösterir.
- **Compatibility:** `liveFiles`/`liveFilesCount` DOM kimlikleri ve eski dosya sayaçları korunur.
- **Verification:** `node test/ui-smoke.test.js`, `npm test`, yerel sunucu kökü `HTTP 200`; in-app görsel QA aracı bu oturumda mevcut değildi.
- **Files:** `orchestrator/web/index.html`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-14 — Sessiz kalan CLI mesajı ilerlemeyi doğru anlatıyor

- **Change:** Dashboard, silence timeout durumunda agent'ın daha önce ürettiği çıktıyı yok saymadan “uzun süre yeni çıktı gelmedi” açıklamasını gösteriyor.
- **Reason:** OpenCode'un araç kullanıp ilerledikten sonra sağlayıcı/model adımında sessiz kalması, eski “hiç ilerleme üretmedi” mesajını yanıltıcı yapıyordu.
- **Impact:** Ham çıktı korunur ve kullanıcı kurulum hatasıyla son adım beklemesini ayırt edebilir.
- **Compatibility:** SSE olayları ve timeout davranışı değişmedi.
- **Verification:** `node test/ui-smoke.test.js` ve gerçek OpenCode JSON akış kaydı.
- **Files:** `orchestrator/web/index.html`, `orchestrator/src/engine.js`
