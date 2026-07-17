# Team Flow Page Context

**Source:** `orchestrator/web/flow.html`

**Last verified:** 2026-07-17

## Purpose

Operatörün ekip kurma ve delegasyon akışını, agent filosunu, aktif/geçmiş işleri ve kronolojik olayları ayrı bir canlı görselleştirme sayfasında sunar.

## Current behavior

- Tarayıcı ve sayfa başlığı akış yüzeyini `CrewCtl` markası altında “Orkestrasyon Merkezi” olarak tanımlar.
- Üst KPI'lar operatör, tur, delegasyon, aktif agent, değişen dosya ve çağrı sayısını gösterir.
- Sol panel config'deki etkin agent filosunu; orta Three.js/WebGL sahnesi operatör çekirdeğini, agent gezegenlerini ve delegasyon bağlantılarını; sağ panel zaman çizelgesini gösterir.
- Aktif operatör-agent bağlantısının hattı ve ok ucu hedef agentın CLI rengini kullanır. Hat üzerindeki sürekli enerji paketleri operatörden agente doğru veri yönünü gösterir.
- `message` olayları delegation/result/failure/blocked durumlarını üretir; delegasyon pulse'ı hedef agent renginde agente, sonuç/failure pulse'ı operatör renginde merkeze hareket eder.
- `activity` olayları proses durumu ve kısa canlı çıktıyı; `log` görev başlangıcı/hatasını; `result` final KPI'larını günceller.
- İlk yüklemede aktif veya en son done/failed task'in kayıtlı olayları yeniden oynatılır, ardından SSE canlı akışı devam eder.

## Contracts and invariants

- Sayfa salt-okunur gözlem yüzeyidir; engine veya task state mutasyonu yapmaz.
- Assignment ID, agent node'larını ve olayları birleştiren anahtardır.
- Server/engine SSE olay adı ve payload değişiklikleri bu sayfayla birlikte güncellenmelidir.
- Three.js sahnesindeki bağlantılar agentın hafif süzülme hareketini her karede izler; `prefers-reduced-motion` durumunda veri paketleri sabit aralıklı yön işaretleri olarak kalır.

## Interactions

`server-api.md` SSE ve event-history endpoint'lerini; `engine.md` olay üretimini; `dashboard.md` aynı olayların ana sayfadaki alternatif sunumunu tanımlar.

## Verification

- `cd orchestrator && node test/ui-smoke.test.js`
- Yerel sunucuda aktif görev, yeniden oynatma, delegation/result/failure ve resize davranışlarını kontrol et.

## Major Changes

### 2026-07-17 — Agent renkli yönlü veri akışı

- **Change:** Sabit yeşil operatör-agent bağı kaldırıldı; bağlantı hattı ve ok ucu hedef agentın CLI rengini alıyor. Aktif bağlantıda operatörden agente ölçülü hızda sürekli hareket eden üç veri paketi gösteriliyor; tekil delegasyon/sonuç pulse renkleri de yönün sahibine bağlandı.
- **Reason:** Hangi bağlantının hangi agente ait olduğunu ve veri yönünün operatörden agente aktığını sahnede doğrudan anlaşılır kılmak.
- **Impact:** Aktif delegasyonlar agent rengiyle ayrışır; kullanıcı yalnızca tek seferlik message pulse'ına bağlı kalmadan sürekli akış yönünü görür.
- **Compatibility:** SSE payload'ları ve görev akışı değişmedi; yalnızca Three.js sunumu değişti.
- **Verification:** `node test/ui-smoke.test.js`, `npm test`; in-app tarayıcı REPL aracı bu oturumda mevcut değildi.
- **Files:** `orchestrator/web/flow.html`, `orchestrator/test/ui-smoke.test.js`
