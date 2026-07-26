# Engine Context

**Source:** `orchestrator/src/engine.js`

**Last verified:** 2026-07-25

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
- Turun tüm delegasyonları bittikten sonra, tamamlama kararlarından önce doğrulama kapısını çalıştırır; kırmızı kapıda kestirmeleri bastırır ve komut çıktısını operatöre kanıt olarak besler (`verify.md`).
- Etkinse görev öncesi izole bir git worktree açıp `_cwd`'yi oraya taşır ve teslimatta branch'e commit'ler; proje profili için `_projectDir` ayrı tutulur (`worktree.md`).
- İhraç edilen singleton süpervizördür: kuyruğu okur, `maxConcurrentTasks` kadar worker slotu doldurur ve durumu toplar. Görev yürütme worker örneklerinde olur (`concurrency.md`).

## Contracts and invariants

- Operatör yalnızca katalogdaki etkin ve sağlıklı agent'lara `implement|review|research|plan` türünde görev verir.
- Bilinen uzman rolleri görev türünü bağlayıcı biçimde sınırlar: executor→`implement`, reviewer→`review`, planner→`plan`; katalog bu sözleşmeyi `allowedKinds` ile operatöre bildirir.
- Review kararının son `VERDICT: PASS|FAIL` satırı korunur; PASS sonrası gereksiz yeni review turu açılmaz.
- Bir turun tüm atamaları tamamlanmış ve turun en güncel incelemesi PASS ise `operator.passFastPath !== false` koşuluyla ikinci operatör değerlendirme çağrısı atlanır.
- Doğrulama kapısı kırmızıyken FAST erken tamamlama, PASS hızlı yolu ve inceleme döngüsü valisi devre dışıdır; karar operatöre gider. Kapı `verify.commands` boşken hiç çalışmaz ve önceki davranış birebir korunur.
- Kırmızı kapı teslimatı en fazla `verify.maxAttempts` kez engeller; sonrasında iş çöpe atılmaz, uyarılı teslimat yapılır.
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

### 2026-07-25 — Motor süpervizör + worker slotlarına ayrıldı (eşzamanlı görev)

- **Change:** `Engine` opsiyonel `shared` bağlamı alıyor; ihraç edilen singleton süpervizör (slot yönetimi, durum toplama), her eşzamanlı görev kendi `Engine` örneğinde koşuyor. Eski `loop()` gövdesi worker'a `executeQueued()` olarak taşındı; `stop()` tüm slotları durduruyor. Ayrıntı: `concurrency.md`.
- **Reason:** Görev başına durumun tamamı zaten `this.*` üzerindeydi; worker-başına örnek bu ~150 dokunuş noktasını değiştirmeden izole eder ve `publish()`'in örtük `taskId` varsayılanını doğru tutar.
- **Impact:** `maxConcurrentTasks > 1` iken görevler paralel koşar. Karantina haritası slotlar arasında paylaşılır; olaylar süpervizöre iletilir ve `status` olayı toplu durumu yayınlar.
- **Compatibility:** Varsayılan 1 → davranış birebir aynı. `status().current` tekil kalır (`runs[0]`), `currents`/`activeIds`/`concurrency` eklenir. Singleton hâlâ tam bir Engine'dir, bu yüzden testlerin doğrudan `runTask()` çağrısı çalışmaya devam eder.
- **Verification:** `npm test` (12 suite); `test/concurrency.test.js` iki görevin gerçekten üst üste koştuğunu ve olay atfının karışmadığını ölçer.
- **Files:** `orchestrator/src/engine.js`, `orchestrator/src/store.js`, `orchestrator/test/concurrency.test.js`

### 2026-07-25 — Çalışma ağacı izole edilebilir hâle geldi (`_cwd` / `_projectDir` ayrımı)

- **Change:** `runTask`, çalışma dizinini çözdükten sonra `setupWorktree` ile `_cwd`'yi izole git worktree'sine taşıyor; `complete()` içinde `finalizeWorktree` branch'e commit'liyor ve `delivery.git` üretiyor. Proje profili okuma/yazma artık `_projectDir` (özgün depo) kullanıyor.
- **Reason:** Ajanların kullanıcının çalışma ağacını doğrudan değiştirmesini önlemek ve teslimatı gözden geçirilebilir bir branch'e dönüştürmek.
- **Impact:** `_cwd` tek dokunuş noktası olduğu için snapshot, canlı diff, checkpoint, sandbox, ajan prosesleri ve doğrulama kapısı kendiliğinden izole ağacı hedefler. Başarısız görevin izole ağacı korunur ve yolu bildirilir.
- **Compatibility:** `worktree.mode` varsayılan `off`; kapalıyken tüm akış aynen çalışır. Git yok/depo değil/HEAD yok durumlarında uyarı yayınlanıp eski davranışa düşülür. **Kritik:** proje profili worktree'de değil özgün depoda tutulmalıdır, aksi halde `.crewctl` gitignore'daysa bağlam sessizce kaybolur.
- **Verification:** `npm test` (11 suite); `test/worktree.test.js` gerçek depoda ana ağacın korunduğunu ve işin branch'te commit'lendiğini doğrular.
- **Files:** `orchestrator/src/engine.js`, `orchestrator/src/worktree.js`, `orchestrator/test/worktree.test.js`

### 2026-07-25 — Doğrulama kapısı tamamlama kararlarının önüne alındı

- **Change:** Round döngüsünde `runAssignments` sonrasına tek çağrı noktalı `runVerifyGate` eklendi; FAST/PASS/vali kestirmeleri `gate.ok` koşuluna bağlandı, operatörün kırmızı kapıya rağmen verdiği `complete` kararı bir kez düzeltme turuyla reddedilir, `operatorPrompt` review evresine `## Dogrulama kapisi` kanıt bloğu ve kapı disiplini kuralı eklendi.
- **Reason:** Teslimatın tek kalite dayanağı LLM'in `VERDICT: PASS` kanaatiydi; çalıştırılan bir kanıt katmanı yoktu.
- **Impact:** `complete()` çalıştırılan kanıtı modelin beyanının önüne koyar ve `delivery.verify` üretir; `finishExhausted`/`salvage` kırmızı kapıyı uyarı olarak taşır.
- **Compatibility:** `verify.commands` boşken (varsayılan) kapı hiç çalışmaz; mevcut tur/çağrı bütçeleri ve tüm testler değişmeden geçer.
- **Verification:** `npm test` (9 suite); `test/verify.test.js` yeşil ve kırmızı kapıyı sahte CLI ile uçtan uca doğrular.
- **Files:** `orchestrator/src/engine.js`, `orchestrator/src/verify.js`, `orchestrator/test/verify.test.js`

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
