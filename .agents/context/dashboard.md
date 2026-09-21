# Dashboard Context

**Source:** `orchestrator/web/index.html`

**Last verified:** 2026-09-21

## Purpose

Motor durumunu, yeni görev oluşturmayı, kuyrukları, aktif ekip haritasını, birleşik olay akışını ve canlı CLI terminallerini tek sayfada sunan ana web arayüzüdür.

## Current behavior

- Tarayıcı başlığı ve header ürün adını `CrewCtl` olarak gösterir; “Command Center” arayüzün açıklayıcı suffix'idir.
- Header engine durumu, aktif agent, günlük çağrı bütçesi, onay modu, başlat/durdur, ekip akışı/canlı kod/settings ve tema kontrollerini taşır.
- İlk otonom engine başlatmada kalıcı consent modalı gösterilir.
- Görev alanı ve kuyruk sol sütunda; misyon, ekip haritası, feed ve teknik terminaller sağ sütundadır.
- Dashboard açılışta aktif görevin olay geçmişini otomatik replay eder; aktif görev yoksa en son tamamlanan veya başarısız görev geri yüklenir. Bootstrap sırasında gelen SSE olayları replay bitene kadar tamponlanır ve yinelenmeden uygulanır.
- `/api/events` SSE olayları dashboard içinde `status`, `queue`, `activity`, `message`, `log`, `result`, `schedules` ve `cli-health` handler'larına dağıtılır.
- CLI prosesleri için başlama, ilerleme, stdout/stderr, timeout, sessizlik timeout ve bitiş durumları görselleştirilir.
- Canlı kodlama görünümü ayrı `code.html` sayfasındadır; dashboard header'ından açılır.
- Tema tercihi `localStorage` içinde saklanır.

## Contracts and invariants

- UI framework kullanmaz; HTML, CSS ve JavaScript tek dosyada inline tutulur.
- Dinamik kullanıcı/CLI metinleri `esc()` ile HTML'e aktarılır.
- SSE olay adları ve payload alanları `server.js`/`engine.js` ile ortak sözleşmedir.
- Ham terminal çıktısı ikincil, katlanabilir alanda kalır; kullanıcı dostu durum özeti birincil gösterimdir.
- Renk standardı proje geneliyle tektir: her katılımcı CLI marka rengiyle gösterilir (`CLI_COLOR`:
  codex `#10a37f`, claude `#d97757`, gemini `#4285f4`, opencode `#0ea5e9`, custom gri — `flow.html`
  `CLI_META` ile birebir). Feed mesajları gönderenin, terminal kartları ve ekip haritası düğümleri
  ilgili agent'ın CLI rengini alır (`--agent-accent` / `--nacc` inline). Çalışıyor/hata durumları
  renk değil ayrı ipuçlarıyla (nabız, ilerleme çubuğu, kırmızı halka, `failure`/`blocked` kırmızı) belirtilir.
- Duyarlı yerleşim dört sayfa için ortaktır ve `app.css` "Duyarlı yerleşim" bölümündedir. Kurallar: kapsayıcı sarar, rozet/hap/çip bölünmez; ızgara çocukları `min-width:0`; header sabit değil `min-height`; uzun metin `overflow-wrap: break-word` (anywhere değil); `tiles` `auto-fit`. Sayfaya özel sabit genişlik/yükseklik eklenirken bu kurallar bozulmamalıdır.
- CLI sağlık yorumu tek yerdedir: `app.js` `window.CrewHealth` (renk tonu, etiket, yenilenme zamanı, hazır mı). Kaynak sunucunun `cliStatus[].health` sonucudur; agent için yoksa `agent.health` kullanılır. Sağlık gösteren her yer bunu çağırır, kendi yorumunu yazmaz.

## Interactions

Görevler için `tasks.md`, ayarlar için `settings.md`, klasör seçici için `filesystem-picker.md`, tamamlanan görev sohbeti için `operator-chat.md`, ayrı görselleştirme için `team-flow.md` context'lerine bak.

## Verification

- `cd orchestrator && node test/ui-smoke.test.js`
- Görsel veya etkileşimli değişiklikte yerel sunucuda dashboard'u ve responsive davranışı canlı kontrol et.

## Major Changes

### 2026-09-21 — Ortak duyarlı yerleşim ve tek sağlık kaynağı

- **Change:** `app.css`'e dört sayfa ve tüm modallar için ortak "Duyarlı yerleşim" bölümü eklendi. `app.js`'e paylaşılan `CrewHealth` yardımcısı eklendi. Ana ekran, ayarlar, CLI kartları, operatör seçimleri ve Ekip Akışı aynı sağlık yorumunu kullanıyor. `server-flow` testi `NO_OPEN` ile çalışıyor.
- **Reason:** 390 px'te ana içerik ekrandan ~97 px taşıyordu. Board/code/flow header'ı sabit 58 px olduğu için sarılan butonlar içeriğin üstüne biniyordu. Ayarlar sekmeleri 330 px taşıyordu, Canlı Kod istatistik kutuları ekrana sığmıyordu. Ayrıca aynı sağlık bilgisi bazı yerlerde hiç kullanılmıyor, bazı yerlerde yanlış gösteriliyordu (Ekip Akışı'nda girişsiz Gemini "hazır · sırada"). Test sunucusu her çalışmada kullanıcının tarayıcısında ölü bir sekme açıyordu.
- **Impact:** 1440/1024/768/390 px'te 17 ekran durumu (4 sayfa, 6 ayar sekmesi, 7 modal) taşmasız. Hazır olmayan CLI her yerde aynı etiket ve renkle görünüyor.
- **Compatibility:** Geniş ekran görünümü değişmedi. Mantık ve config şeması aynı. `app.js` defer yüklendiği için sayfalar `CrewHealth`'i çağrı anında ve korumalı kullanır.
- **Verification:** `npm.cmd test`. Headless Chrome ile her ekranı dört genişlikte açıp taşmaları ölçen tarama: ilk çalıştırmada birden çok gerçek sorun, düzeltmeden sonra 68/68 temiz; ekran görüntüleri gözle de kontrol edildi.
- **Files:** `orchestrator/web/app.css`, `orchestrator/web/app.js`, `orchestrator/web/index.html`, `orchestrator/web/flow.html`, `orchestrator/test/ui-smoke.test.js`, `orchestrator/test/server-flow.test.js`

### 2026-07-18 — CLI marka renk standardı ve terminal taşma düzeltmesi

- **Change:** Feed mesajları, canlı terminal kartları ve ekip haritası düğümleri artık duruma göre
  (operatör=mor, başarı=yeşil) değil, agent'ın CLI marka rengine göre renklendirilir (`CLI_COLOR`,
  `flow.html` `CLI_META` ile aynı). `.agent`'a `min-width:0` ve `.terminal`'a satır sarma eklenerek
  uzun CLI çıktısının kartların üzerine taşması giderildi.
- **Reason:** Aynı agent'ın farklı yüzeylerde farklı renklerde görünmesi (ör. codex logda mor,
  akışta yeşil) kafa karıştırıyordu; terminal metni yatayda taşıyordu.
- **Impact:** Kimlik rengi tüm yüzeylerde tutarlı; çalışıyor/hata durumları nabız/ilerleme/kırmızı
  halka gibi ayrı ipuçlarıyla gösterilmeye devam eder. `failure`/`blocked` mesajları kırmızı kalır.
- **Compatibility:** Yalnızca görsel/CSS ve inline stil; SSE sözleşmesi ve DOM kimlikleri değişmedi.
- **Verification:** `npm test`; ui-smoke inline script sözdizimi. Görsel doğrulama kullanıcıya bırakıldı.
- **Files:** `orchestrator/web/index.html`

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
