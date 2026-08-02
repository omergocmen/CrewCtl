# CrewCtl Proje Profili

## Amacı ve Kapsamı
CrewCtl, yerel ortamda kurulu olan yapay zeka CLI araçlarını (Codex, Claude Code, Gemini ve OpenCode) tek bir operatörün (Operator) yönetiminde çalışan, birbirleriyle delege ve inceleme (review) ilişkileri kurabilen uzman bir ajan filosu (Agent Pool) olarak koordine eden sıfır çalışma zamanı (runtime) bağımlılıklı bir Node.js uygulamasıdır. 

Kullanıcılar CLI aracılığıyla veya zengin görselliğe sahip Web Kontrol Paneli (Command Center) üzerinden görevleri yönetebilir, zamanlayabilir, canlı dosya değişikliklerini (Live Diff) izleyebilir ve Three.js/WebGL tabanlı canlandırmalar ile ekiplerin delege akışını takip edebilir.

## Mimari ve Giriş Noktaları
Uygulama, Node.js 18+ ortamında çalışan ve CommonJS modül sistemini kullanan saf (sıfır harici kütüphane bağımlılığına sahip) bir mimariye sahiptir.

- **Paket Sahipliği:** Proje, `@omerrgocmen/crewctl` adıyla npm'de yayımlanır ve küresel executable komutu `crewctl`'dir.
- **Tüketici Modu:** Kullanıcılar projeyi kurmadan `npx @omerrgocmen/crewctl` ile doğrudan kendi çalışma dizinlerinden çalıştırabilirler.
- **Geliştirici Girişi:** Proje kök dizininde `npm install`, `npm test` ve `npm start` komutlarıyla geliştirilir.

### Ana Giriş Noktaları:
1. **CLI Girişi (`orchestrator/src/cli.js`):** Terminal komutlarını, parametreleri, görev kuyruğunu ve etkileşimli operatör süreçlerini başlatır.
2. **Server Girişi (`orchestrator/src/server.js`):** HTTP API'lerini sunan, canlı durum güncellemelerini Server-Sent Events (SSE) ile aktaran ve web arayüzü dosyalarını sunan hafif yerleşik sunucudur.

## Klasör Yapısı
- `.agents/`: Ajanların işletim sistemi dökümantasyonunu (`AGENTS.md`, `CONTEXT.md`), modül bazlı bağlam dosyalarını (`context/*.md`) ve context maintainer kurallarını barındırır.
- `orchestrator/src/`: Tüm arka plan motorunu, veri yönetimini ve CLI entegrasyonlarını barındıran çekirdek JavaScript dosyaları.
- `orchestrator/web/`: HTML, Vanilla CSS ve Vanilla JS ile oluşturulmuş, Three.js kullanan tamamen bağımsız ve modern web paneli.
- `orchestrator/roles/`: Operatör ve uzman ajanlar için sistem prompt sözleşmeleri (Markdown formatında).
- `orchestrator/skills/`: Ajanların kullanabileceği yerel yetenek promptları ve kuralları.
- `orchestrator/test/`: Bağımlılıksız test dosyaları ve testlerde kullanılan sahte CLI simülasyonları.

## Temel Modüller ve Sorumluluklar

### 1. `store.js` (Veri, Konfigürasyon ve Durum Yönetimi)
- **Varlık (Assets) ve Veri Kökü (Root) Ayrımı:** Paket dosyalarını salt-okunur (`store.ASSETS`) tutarken; kullanıcının ürettiği `config.json`, `queue/`, `state/`, `memory/` ve özelleştirilmiş `roles/` ile `skills/` dizinlerini yazılabilir veri kökünde (`store.ROOT`) tutar.
- **Yazılabilir Kök Seçimi:** `CLI_TEAM_ROOT` > `CREWCTL_HOME` > test/geliştirme tespiti (ROOT=ASSETS veya `~/.crewctl`) önceliğine göre dinamik belirlenir.
- **Konfigürasyon Yönetimi:** `config.json` yoksa varsayılan şablonu kopyalar ve idempotent `normalizeConfig()` ile eski şemaları otomatik olarak güncel şemaya taşır.

### 2. `engine.js` (Görev Yaşam Döngüsü ve Çalıştırma Motoru)
- Görevlerin kuyruğa alınması, önceliklendirilmesi, atanması ve çalıştırılması süreçlerini yönetir.
- CLI süreçlerini otonom parametrelerle yönetir, çıktıların sessizlik zaman aşımını (timeout) izler. Canlı dosya taraması (`liveDiff`) ile çalışma alanındaki değişiklikleri algılar.

### 3. `cli-registry.js` (CLI Keşif ve Normalizasyon)
- PATH ve popüler paket yöneticisi/Unix yollarını tarayarak sistemdeki CLI'ları (Codex, Claude, Gemini, OpenCode) otomatik keşfeder.
- Model ayarlarını normalleştirir; bozuk veya çelişkili `cmd` ve `adapter` alanlarını otomatik onarır.
- Sağlık durumlarını (health-check) geçici gerçek prompt dosyaları üzerinden otonom test ederek doğrular.

### 4. `checkpoints.js` (Sürüm Kontrolü ve Güvence)
- Bir görev başlamadan önce çalışma klasörünün anlık yedeğini (checkpoint) alır. Görev başarısız olduğunda veya istendiğinde workspace'i güvenle eski haline geri yükleyebilir.

### 5. `schedule.js` (Zamanlama Katmanı)
- Tekrarlanan görevleri yan etkisiz (pure) doğrulama süreçleriyle değerlendirir ve motor boşta olduğunda otomatik olarak kuyruğa ekler.

### 6. `skill-registry.js` (Yetenek Keşfi ve Yönetimi)
- Yerel skill prompt'larını keşfeder, görev tanımıyla eşleştirir, bağlam bütçesini ve maliyet takibini yönetir.

## Sözleşmeler ve Konvansiyonlar
- **Sıfır Bağımlılık:** `package.json` içerisinde çalışma zamanı (runtime) için hiçbir harici npm paket bağımlılığı yer alamaz. Sadece Node.js dahili modülleri (fs, path, child_process, http vb.) kullanılmalıdır.
- **Platform Uyumluluğu:** Windows, macOS ve Linux sistemlerinde dosya yolları, unicode karakterler ve `.cmd/.bat` çalıştırma biçimleri sorunsuz desteklenmelidir.
- **Veri Güvenliği:** Yerel `config.json`, çalışma klasörü yedekleri ve runtime logları asla Git'e commit edilmemelidir.
- **Hata Yönetimi (Error Handling):** Her asenkron işlem try-catch bloğu içerisinde ele alınmalı ve sistemin çökmesi engellenmelidir.

## Kurulum, Çalıştırma ve Test Komutları
- **Geliştirme Kurulumu:** `npm install` (Proje kök dizininde)
- **Uygulamayı Başlatma:** `npm start` (Yerel sunucuyu ve web panelini kaldırır)
- **Ortam Sağlık Raporu:** `npm run doctor` (Ortamı analiz eder, `--fix` parametresiyle eksik konfigürasyonları otomatik düzeltebilir)
- **Testleri Çalıştırma:** `npm test` (Tüm birim ve entegrasyon testlerini çalıştırır)
- **Paket Paketleme Provası:** `npm pack --dry-run --json` (Npm tarball içeriğini doğrular)

## Dikkat Edilmesi Gereken Önemli Noktalar
1. **Dosya Güncellemeleri:** Herhangi bir kod veya yapılandırma değişikliğinden sonra `.agents/context/` altındaki ilgili Markdown dosyası ve `index.md` kaynak haritası güncel tutulmalıdır.
2. **Katalog Modelleri:** `cliSettings` yalnızca Codex ve OpenCode gibi doğrulanmış model kataloğu olan entegrasyonları saklar; Claude ve Gemini model yönetimi CLI'ların kendi varsayılanlarına bırakılmıştır.
3. **Zamanlayıcı Sınırları:** Claude CLI'ın tamponlama (buffering) davranışından dolayı genel sessizlik zaman aşımı 300 saniye olarak muhafaza edilmektedir. Diğer CLI'lar için bu süre 180 saniyedir.