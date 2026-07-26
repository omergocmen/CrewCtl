# Settings Context

**Sources:** `orchestrator/web/index.html`, `orchestrator/src/server.js`, `orchestrator/src/cli-registry.js`, `orchestrator/config.default.json`

**Last verified:** 2026-07-25

## Purpose

Agent profillerini, rol dosyalarını, CLI-geneli model politikalarını, operatör davranışını ve genel runtime ayarlarını dashboard içindeki modal üzerinden yönetir.

## Current tabs

- **Agent'lar & Roller:** kurulu CLI durumları, yeniden keşif, gizlenen otomatik adapter'lar, uzman agent ekleme/silme/düzenleme ve role Markdown CRUD.
- **CLI'lar ve Modeller:** kurulu CLI kartları; Codex model/effort/service tier, kullanıcının Claude Code oturumundan gelen model kataloğu ve sağlayıcı gruplu OpenCode modeli. Gemini CLI varsayılanını kullanır.
- **Operatör:** operatör CLI, tur/delegasyon/protokol limitleri ve `operator.md` editörü.
- **MCP Araçları:** içe dönük MCP sunucularının form tabanlı yönetimi — global etkinleştirme, kapsam (`strict`/`inherit`), delegasyon başına sunucu sınırı; sunucu başına ad, açıklama, komut/URL, argümanlar, ortam değişkenleri, görev türü seçimi, yazma yetkisi ve agent kısıtı. Tek tıkla eklenebilen hazır şablonlar (Playwright · dosya sistemi · fetch · CrewCtl'in kendisi).
- **Genel:** varsayılan çalışma klasörü, approval modu, günlük bütçe, timeout, memory/team context bütçeleri, bildirim webhook'u, doğrulama kapısı (komut listesi · zaman aşımı · kırmızı kapı davranışı), eşzamanlı görev sayısı, git worktree izolasyonu (mod · bağlanacak klasörler · kurulum komutları) ve gelişmiş ham JSON.

## Contracts and invariants

- Modal açılırken config, `draftAgents`, `draftCliSettings` ve `draftIgnoredAdapters` taslaklarına kopyalanır; kaydedilmemiş taslaklar CLI taramasında korunur.
- Otomatik keşfedilen agent silinirse adapter gizleme listesine eklenir ve sonraki taramada geri oluşturulmaz.
- Bilinen bir CLI komutu düzenlendiğinde agent adapter'ı, varsayılan argümanları ve model sahipliği UI taslağında birlikte eşitlenir.
- Operatör uzman agent değildir; ayrı CLI seçimidir ve rolü `roles/operator.md` olarak sabittir.
- Uzman rolü yalnızca prompt metni değil, izin verilen görev türüdür: executor uygulama, reviewer inceleme, planner planlama yapar.
- Config kaydı server tarafı doğrulamasından geçer; en az bir uzman gerekir.
- MCP sekmesi `draftMcp` taslağı üzerinde çalışır (`draftAgents` ile aynı desen); Kaydet basılana kadar config'e dokunmaz. Kaydetmede adsız sunucular atılır, adlar/açıklamalar trim'lenir, boş argüman satırları düşer, `ANAHTAR=değer` satırları ortam değişkenine çevrilir (değer içindeki `=` korunur) ve URL verildiyse `command`/`args` gönderilmez.
- Kart, seçili türlerle yazma yetkisinin çelişkisini **kaydetmeden önce** gösterir ("Fiilen verilecek: …"): `write: true` bir sunucu `review`/`research`/`plan` türlerine motor tarafında hiçbir koşulda verilmez.
- Doğrulama komutu alanı satır başına bir komut kabul eder; boş satırlar atılır ve liste boşken kapı kapalıdır. Kırmızı kapı seçimi `blockOnFailure` değerine karşılık gelir ("Teslimatı engelle" / "Yalnızca rapor et").
- Global model, aynı adapter'ın operatör ve tüm uzman çağrılarına uygulanır; agent profilindeki model daha yüksek önceliklidir.
- Codex, Claude Code ve OpenCode agent'larının boş override seçeneği, miras aldığı global modelin adını açıkça gösterir; otomatik profillerde kullanıcı seçimi `modelOverride` sayılır.
- Claude Code seçenekleri statik değildir: Agent SDK initialize yanıtındaki `value`, `displayName`, `description` ve yetenek alanlarından üretilir. Böylece yalnızca mevcut hesap/sağlayıcı/kurum politikasının bildirdiği modeller görünür; boş seçim dinamik `Default` açıklamasını gösterir.
- OpenCode seçenekleri sağlayıcı sırasıyla `opencode`, `opencode-go`, `minimax-coding-plan`, diğerleri ve en sonda `ollama` gruplarına ayrılır; katalogsuz CLI için model girdisi gösterilmez.

## Interactions

Config şeması için `configuration.md`, CLI keşfi için `cli-registry.md`, rol davranışı için `roles.md`, klasör seçimi için `filesystem-picker.md` context'lerine bak.

## Verification

- `cd orchestrator && node test/ui-smoke.test.js`
- Ayar değişikliklerinde `/api/config` validasyonunu ve yeniden açıldığında değerlerin korunmasını kontrol et.

## Major Changes

### 2026-07-25 — MCP Araçları sekmesi (form tabanlı)

- **Change:** İçe dönük MCP artık Genel sekmesindeki ham JSON alanı yerine kendi sekmesinde form tabanlı yönetiliyor: sunucu kartları (ad · açıklama · komut/URL · argümanlar · ortam · görev türleri · yazma yetkisi · agent kısıtı), ekle/sil, hazır şablonlar ve "fiilen verilecek türler" önizlemesi. `draftMcp` taslağı eklendi.
- **Reason:** Ham JSON düzenlemek `config.json`'u elle açmaktan farklı değildi; MCP sunucusu eklemek arayüzden gerçekten yapılabilmeliydi.
- **Impact:** Kullanıcı MCP sunucusu eklerken şema bilmek zorunda değil; rol kapısının sonucu (yazma yetkisi ile seçili türlerin çelişkisi) kaydetmeden önce görünür.
- **Compatibility:** Üretilen gövde mevcut `config.mcp` şemasıyla birebir aynıdır; `/api/config` doğrulaması ve `mcp.normalizeConfig` değişmedi. Eski ham JSON alanı kaldırıldı (Genel sekmesindeki genel ham JSON düzenleyici duruyor).
- **Verification:** `node orchestrator/test/ui-smoke.test.js` — taslak→config dönüşümü gerçekten koşturulur ve çıktının `mcp.normalizeConfig` ile rol kapısından geçtiği doğrulanır; canlı panelde `PUT /api/config` 200 döndü ve sunucular kalıcılaştı.
- **Files:** `orchestrator/web/index.html`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-24 — Claude Code model seçimi eklendi

- **Change:** CLI'lar ve Modeller sekmesine kullanıcı oturumunun desteklediği modelleri ad, güncel sürüm açıklaması ve CLI kimliğiyle gösteren global Claude Code dropdown'ı; her Claude uzman kartına da global ayarı miras alan model override dropdown'ı eklendi.
- **Reason:** Claude Code kullanıcılarının modeli Codex ve OpenCode ile aynı ayar akışından seçebilmesi.
- **Impact:** Seçim operatör ve tüm Claude uzmanlarına uygulanır; agent seçimi global değerden önceliklidir.
- **Compatibility:** Boş seçim önceki Claude Code hesap/kurum varsayılanı davranışını korur; katalog alınamazsa eski alias veya kayıtlı özel model adı kaybolmadan “kayıtlı” seçeneği olarak gösterilir. Eski CLI için sabit sürüm tablosu uygulanmaz.
- **Verification:** `node orchestrator/test/ui-smoke.test.js`, `node orchestrator/test/cli.test.js`.
- **Files:** `orchestrator/web/index.html`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-14 — Balanced çalışma sırası agent ekranında görünür

- **Change:** Agent ayarları, hazır standart rollerin balanced uygulama görevlerinde `planner → executor → reviewer` sırasıyla çalışacağını açıkça gösteriyor.
- **Reason:** Etkin bir planner'ın hangi modda ve hangi sırada kullanılacağını kullanıcıya öngörülebilir kılmak.
- **Impact:** UI açıklaması engine'in zorunlu rol zinciriyle aynı davranışı anlatır.
- **Compatibility:** Agent düzenleme alanları ve fast mod değişmedi.
- **Verification:** `node test/ui-smoke.test.js` ve izole `npm test`.
- **Files:** `orchestrator/web/index.html`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-14 — Rol seçiminin çalışma etkisi görünürleştirildi

- **Change:** Agent ayarları açıklaması, seçilen rolün görev türünü bağlayıcı olarak sınırladığını açıkça belirtiyor.
- **Reason:** Bir CLI'yı executor seçen kullanıcının planner veya reviewer tarafından ikame edilmesini önleyen runtime davranışını UI ile uyumlu anlatmak.
- **Impact:** Rol seçimi öngörülebilir; eski capability listeleri rol sınırını aşamaz.
- **Compatibility:** Mevcut standart rol dosyaları otomatik olarak yeni sınırı kullanır.
- **Verification:** UI smoke ve izole `npm test`.
- **Files:** `orchestrator/web/index.html`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-14 — CLI komutu ve adapter UI'da birlikte değişiyor

- **Change:** Agent'ın `cmd` alanı bilinen başka bir CLI'ya çevrilince adapter rozeti ve güvenli varsayılan argümanlar aynı anda güncelleniyor; model override'ı temizleniyor.
- **Reason:** Görünür komut ile gizli adapter bilgisinin ayrışıp yanlış CLI çalıştırmasını önlemek.
- **Impact:** Agent düzenleme ve kaydetme akışı tutarlı profil üretir; server/runtime ek savunma katmanı olarak kalır.
- **Compatibility:** Özel komutlar UI'da `custom` olur; gelişmiş wrapper adapter'ları ham JSON ile tanımlanabilir ve backend tarafından korunur.
- **Verification:** `node test/ui-smoke.test.js` ve izole kopyada `npm test`.
- **Files:** `orchestrator/web/index.html`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-14 — Miras alınan model görünür hale getirildi

- **Change:** OpenCode/Codex agent dropdown'larının boş seçeneği miras alınan CLI modelini adıyla gösteriyor; Claude/Gemini serbest metin ve datalist alanları kaldırıldı.
- **Reason:** Global model seçiminin uygulanmadığı izlenimini kaldırmak ve katalogsuz model adlarını kullanıcıdan istememek.
- **Impact:** Agent ekranı gerçek runtime önceliğini görünür kılar; yalnızca katalog destekli CLI'larda model seçimi sunulur.
- **Compatibility:** Eski Claude/Gemini UI model ayarları kayıtta temizlenir; CLI varsayılanı kullanılır.
- **Verification:** `node test/ui-smoke.test.js` ve izole kopyada `npm test`; miras etiketi ve serbest alanların yokluğu smoke sözleşmesinde doğrulandı.
- **Files:** `orchestrator/web/index.html`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-14 — CLI ve model ayarları ayrı sekmeye taşındı

- **Change:** Model seçimleri Operatör sekmesinden çıkarılıp “CLI'lar ve Modeller” sekmesine taşındı; dört adapter için global ayar ve tüm agent'larda profil bazlı override sunuldu.
- **Reason:** Operatör davranışıyla CLI model politikasını ayırmak ve seçimin aynı CLI'nın tüm kullanımlarına uygulanmasını görünür kılmak.
- **Impact:** Ayarlar modalı, taslak yaşam döngüsü, kaydetme gövdesi ve OpenCode model sunumu değişti.
- **Compatibility:** Kaydetme eski operatör model alanlarını siler; server eski gövdeleri yine normalize eder.
- **Verification:** `node test/ui-smoke.test.js` ve izole kopyada `npm test`; inline script derleme ve yeni sekme/alan sözleşmeleri.
- **Files:** `orchestrator/web/index.html`, `orchestrator/test/ui-smoke.test.js`
