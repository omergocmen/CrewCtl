# Engine Context

**Source:** `orchestrator/src/engine.js`

**Last verified:** 2026-07-17

## Purpose

Dosya tabanlı kuyruktan görev alır; operatör planını, uzman delegasyonlarını, bağımsız incelemeyi, hata kurtarmayı ve nihai teslimatı yürütür.

## Responsibilities

- `fast`, `balanced` ve `deep` yürütme politikalarına tur, delegasyon ve context bütçesi uygular; balanced mod en fazla üç tur kullanır ve ilk planda uygulama+inceleme zincirini hedefler.
- CLI proseslerini platforma uygun başlatır; stdout/stderr, genel timeout ve sessizlik timeout olaylarını yayınlar.
- Operatör JSON protokolünü parse eder; yalnızca protokol hatalarında sınırlı tekrar yapar.
- Atamaları yetenek, sağlık, benzersiz ID ve `dependsOn` kurallarına göre normalize eder.
- Recoverable CLI hatalarını sınıflandırır, sorunlu agent'ı oturum için karantinaya alabilir ve altyapı kurtarma turu tanır.
- Çalışma dizinini görev öncesi/sonrası snapshot'lar; oluşturulan, değiştirilen ve silinen dosyaları teslimata ekler.
- Görev çalışırken metin dosyalarının sınırlı başlangıç içeriğini saklar; değişiklikleri satır/hunk bazlı `filechange` olaylarıyla canlı ve replay edilebilir biçimde yayınlar.
- Tamamlanmış görev hakkındaki salt-okunur operatör sohbetini ayrı akışla yürütür.

## Contracts and invariants

- Operatör yalnızca katalogdaki etkin ve sağlıklı agent'lara `implement|review|research|plan` türünde görev verir.
- Bilinen uzman rolleri görev türünü bağlayıcı biçimde sınırlar: executor→`implement`, reviewer→`review`, planner→`plan`; katalog bu sözleşmeyi `allowedKinds` ile operatöre bildirir.
- Review kararının son `VERDICT: PASS|FAIL` satırı korunur; PASS sonrası gereksiz yeni review turu açılmaz.
- Bir turun tüm atamaları tamamlanmış ve turun en güncel incelemesi PASS ise `operator.passFastPath !== false` koşuluyla ikinci operatör değerlendirme çağrısı atlanır.
- Riskli plan `approvalMode=ask` iken hash'lenerek approval kuyruğuna alınır.
- Otonom consent olmadan engine başlatılamaz.
- `.git`, `node_modules` ve orkestratör runtime klasörleri dosya snapshot'ına dahil edilmez.
- Canlı diff; dosya başına 256 KiB/5000 kaynak satırı, başlangıçta 24 MiB/2000 dosya ve olay başına 1000 gösterilen satırla sınırlıdır. Binary/büyük dosyalar özetlenir; `.env`, credential ve özel anahtar içerikleri olay payload'ına alınmaz.

## Interactions

`store.js` ile görev/state/olay saklar; `cli-registry.js` ile etkin agent komutunu oluşturur; `server.js` engine kontrolünü ve SSE yayınını dışa açar; web sayfaları `activity`, `message`, `log`, `result`, `status` ve `filechange` olaylarını tüketir.

## Verification

- `cd orchestrator && node test/team-flow.test.js`
- `cd orchestrator && node test/live-diff.test.js`
- Proses yaşam döngüsü, recovery, approval, routing, PASS fast-path ve kısmi teslimat senaryolarını doğrula.

## Major Changes

### 2026-07-17 — Canlı satır diff olayları

- **Change:** Periyodik dosya listesi, görev başlangıcı içeriğine göre eklenen/silinen satırları ve Git-benzeri hunk'ları taşıyan `filechange` payload'ına genişletildi; aynı dosyanın sonraki düzenlemeleri yeniden yayınlanıyor.
- **Reason:** Canlı kodlama kartında yalnızca dosya adını değil, agent'ın hangi kodu ekleyip çıkardığını göstermek.
- **Impact:** Engine bellek/olay sözleşmesine sınırlı metin tabanı, satır istatistikleri, hunk'lar ve önizleme durumları eklendi; tamamlanma anında son diff zorla yayınlanıyor.
- **Compatibility:** Eski `files[].path/action` ve dosya `counts` alanları korunur; yeni alanlar additive'dir. Büyük, binary veya hassas dosyalarda içerik yayınlanmaz.
- **Verification:** `node --check src/engine.js`, `node test/live-diff.test.js`, `npm test`.
- **Files:** `orchestrator/src/engine.js`, `orchestrator/test/live-diff.test.js`

### 2026-07-14 — Balanced rol zinciri motor tarafından garanti ediliyor

- **Change:** İlk balanced planda uygulama görevi varsa hazır roller `plan → implement → review` olarak aynı turda zincirleniyor; operatörün atladığı planner veya reviewer motor tarafından ekleniyor.
- **Reason:** Hazır planner profilinin hız talimatı nedeniyle hiç çalıştırılmadan doğrudan koda geçilmesini engellemek.
- **Impact:** Plan çıktısı executor bağlamına, uygulama çıktısı reviewer bağlamına aktarılır; açıkça bağlanmış review kapsamı yardımcı implementasyonlara genişletilmez.
- **Compatibility:** Fast mod küçük görevlerde tek executor davranışını korur; plan/implement içermeyen araştırma ve salt inceleme görevlerine rol enjekte edilmez.
- **Verification:** İzole `npm test`; planner atlama regresyonu, zincir bağımlılıkları, PASS fast-path ve yardımcı implementasyon hatası senaryoları.
- **Files:** `orchestrator/src/engine.js`, `orchestrator/roles/operator.md`, `orchestrator/test/team-flow.test.js`, `orchestrator/test/fake-cli.js`

### 2026-07-14 — Sessizlik zaman aşımı gerçek ilerleme durumunu koruyor

- **Change:** `CLI_STALLED` özeti, CLI'ın hiç çalışmadığını söylemek yerine uzun süre yeni çıktı gelmediğini belirtiyor.
- **Reason:** OpenCode önce dosya ve araç çıktıları üretip yalnızca son adımda sessiz kalabildiği için eski mesaj gerçek çalışma kaydını yanlış tanımlıyordu.
- **Impact:** Başarısız delegasyon doğru sınıflandırılmaya devam ederken önceki ilerleme kayıtlarının korunduğu kullanıcıya açıkça bildirilir.
- **Compatibility:** Sessizlik süresi ve proses sonlandırma davranışı değişmedi.
- **Verification:** Gerçek OpenCode çalıştırma kaydı, `node --check src/engine.js`, UI smoke ve `npm test`.
- **Files:** `orchestrator/src/engine.js`, `orchestrator/web/index.html`

### 2026-07-14 — Uzman rolü görev türünü zorunlu kılıyor

- **Change:** Agent kataloğu `allowedKinds` yayımlıyor ve routing, rol dosyasına aykırı assignment'ı uygun role taşıyor.
- **Reason:** Planner profilinde kalmış genel `implementation` yeteneğinin executor yerine uygulama görevi almasını engellemek.
- **Impact:** Seçili OpenCode executor uygulama işini, Codex reviewer incelemeyi, planner planlamayı üstlenir; operatör yanlış eşleme üretse bile motor düzeltir.
- **Compatibility:** Özel/bilinmeyen role sahip agent'lar mevcut capability tabanlı routing davranışını korur.
- **Verification:** İzole `npm test`; katalogda executor/reviewer/planner `allowedKinds` regresyonları ve yanlış rol otomatik routing testi.
- **Files:** `orchestrator/src/engine.js`, `orchestrator/test/team-flow.test.js`

### 2026-07-14 — PASS hızlı yolu ve üç turluk balanced politika

- **Change:** Taze PASS ve tamamlanmış tur doğrudan teslim edilir; balanced tur sınırı üçe indi ve ayrı plan delegasyonu yerine ilk turda uygulama+inceleme zinciri istendi.
- **Reason:** Başarılı görevlerde operatör CLI çağrısını ve gereksiz plan/inceleme turlarını azaltarak duvar saati süresini düşürmek.
- **Impact:** Dengeli görevlerin çağrı sayısı ve tamamlanma yolu değişti; inceleme valisi hızlı yol koşulları sağlanmadığında yedek olarak korunuyor.
- **Compatibility:** `operator.passFastPath: false` eski değerlendirme yolunu zorlar; deep mod ayrı planlamayı korur.
- **Verification:** İzole kopyada `npm test`; PASS fast-path, operator-review çağrı sayısı, vali yedeği ve kısmi teslimat senaryoları.
- **Files:** `orchestrator/src/engine.js`, `orchestrator/roles/operator.md`, `orchestrator/test/team-flow.test.js`, `orchestrator/test/fake-cli.js`
