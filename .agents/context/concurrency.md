# Concurrency Context

**Sources:** `orchestrator/src/engine.js` (süpervizör/worker), `orchestrator/src/store.js` (`nextPending`), `orchestrator/config.default.json`

**Last verified:** 2026-07-25

## Purpose

Birden fazla görevi aynı anda yürütür. `maxConcurrentTasks` varsayılan `1`'dir; bu değerde davranış önceki sürümle birebir aynıdır (görevler sırayla koşar).

## Architecture

**İhraç edilen singleton SÜPERVİZÖR'dür**; görevi kendisi koşmaz. Kuyruğu okur, boş slotları doldurur, durumu toplar. **Her eşzamanlı görev kendi `Engine` örneğinde (worker) koşar.**

Bu seçimin gerekçesi mimari: görev başına durumun tamamı (`_cwd`, `_projectDir`, `current`, `_snapBefore`, `_textBefore`, `_usage`, `activeChild`, `callSequence`, `_worktree*`, canlı diff zamanlayıcısı) zaten `this.*` üzerindeydi. Worker-başına örnek, bu ~150 dokunuş noktasını **değiştirmeden** izole eder ve `publish(type, data, taskId = this.current?.id)` örtük varsayılanını **doğru** tutar. Eşzamanlılıkta en tehlikeli hata — bir görevin olayının başka görevin zaman çizelgesine düşmesi — böylece mimari olarak imkânsızlaşır.

Worker'lar süpervizörle yalnızca iki şey paylaşır:
- **Karantina haritası** (`unhealthyAgents`) referansla paylaşılır: bir ajan kalıcı hata verdiyse kardeş görev onu tekrar denememeli.
- **Olay akışı:** worker olayları süpervizöre iletilir (`server.js` yalnızca singleton'a abonedir). `status` olayı özel işlenir — worker'ın kendi durumu tek slotu anlatır, dışarıya **toplu** durum yayılır.

## Contracts and invariants

- **Görev sahiplenme zorunludur.** Çalışan görev `queue/pending` içinde **kalır** (`complete()` taşır), bu yüzden `store.nextPending(skipIds)` olmadan ikinci slot aynı görevi alıp **çift koşum** yapardı. Süpervizör `inFlight` kümesini tutar. `nextPending()` argümansız çağrıldığında eski davranışı birebir korur.
- `maxConcurrentTasks` 1..8 arasına sıkıştırılır; geçersiz/eksik değer 1'e düşer.
- **Eşzamanlılık izolasyon olmadan reddedilir.** `PUT /api/config`, `maxConcurrentTasks > 1` ve `worktree.mode !== "task"` ise 400 döner: iki görev aynı klasörde birbirinin dosyalarını ezerdi. Bu sessizce kabul edilecek bir yapılandırma değildir.
- `status()` geriye uyumludur: `current` tekil kalır (`runs[0]`) ve tek görevli kurulumda bugünkü değerin aynısıdır. Eşzamanlı kurulum için `currents` (dizi), `activeIds` (dizi) ve `concurrency` eklenir. `busy` artık aktif slot varsa da true'dur.
- `stop()` süpervizörün kendi çalışmasını **ve** tüm worker slotlarını durdurur (retry beklemeleri, canlı diff zamanlayıcıları, aktif CLI süreçleri dahil). Aksi halde süpervizör "durdu" görünürken worker'lar arka planda CLI koşmaya devam ederdi.
- Bir slot boşaldığında worker `wake()` çağırır; sıradaki görev `pollSeconds` beklemeden başlar.
- Süpervizör singleton'ı **kendisi de tam bir Engine'dir**: testler `engine.runTask(task)`'i doğrudan çağırmaya devam eder ve bu çalışma da `activeRuns()`'a dahildir.
- Sunucudaki "çalışan görev silinemez/güncellenemez" korumaları `status().activeIds` ile **tüm** slotları kontrol eder; tekil `current` karşılaştırması eşzamanlılıkta yanlış olurdu.

## Verified facts

- **Satıcı katmanı eşzamanlılığa izin veriyor.** İki eşzamanlı `codex exec` **ayrı dizinlerde** ölçüldü: ikisi de exit 0, ayrı oturum kimlikleri (6.2s ve 9.0s). Daha önce gözlenen "codex ikinci exec'i sonlandırıyor" davranışı **aynı dizine** özgüydü — worktree izolasyonu tam olarak bunu ortadan kaldırır.
- `test/concurrency.test.js` gerçek koşumda en yüksek eşzamanlı görev sayısını **2** ölçer, iki görevin ayrı branch/worktree kullandığını, ana ağacın korunduğunu, olay kayıtlarında yabancı görev olayı bulunmadığını ve `callId` sayaçlarının worker başına 1'den başladığını doğrular.

## Known limitations

- **Görev içi delegasyonlar hâlâ seri.** `runAssignments` `dependsOn` grafiğini sırayla yürütür; bağımsız düğümler bile bekler. Eşzamanlılık şu an yalnızca **görevler arasıdır**.
- Günlük çağrı bütçesi sayacı (`store`) paylaşılır; eşzamanlı `bumpCallCount` yazımları Windows'ta nadiren birbirini ezip sayımı hafifçe eksik gösterebilir. Bütçe sınırı bu yüzden yumuşak bir sınırdır.
- `usageSummary()` token telemetrisi bildirmeyen CLI'larda `null` döner; bu yüzden worker-başına sayaç izolasyonu `callId` üzerinden doğrulanır.
- `flow.html` ve `code.html` hâlâ tekil `current`'ı tüketir (ilk aktif görevi gösterir); geriye uyumlu ama eşzamanlı görünürlük için genişletilebilir.

## Verification

- `cd orchestrator && node test/concurrency.test.js` (git kurulu değilse kendini atlar)
- `cd orchestrator && node test/server-flow.test.js` (config sözleşmesi ve güvenlik kapısı)
- `npm test`

## Major Changes

### 2026-07-25 — Eşzamanlı görev yürütme (süpervizör + worker slotları)

- **Change:** `Engine` artık opsiyonel `shared` bağlamı alıyor; singleton süpervizöre dönüştü (`createWorker`, `dispatch`, `releaseWorker`, `activeRuns`, `maxConcurrency`, yeniden yazılmış `loop`), eski `loop()` gövdesi worker'a `executeQueued()` olarak taşındı. `store.nextPending(skipIds)`, `config.maxConcurrentTasks`, `/api/config` güvenlik kapısı, `status()` genişletmesi, panel/pano çoklu görev gösterimi ve `test/concurrency.test.js` eklendi.
- **Reason:** Kuyrukta bekleyen görevler tek tek koşuyordu; worktree izolasyonu geldiği için artık güvenle paralelleştirilebilir.
- **Impact:** `maxConcurrentTasks > 1` iken duvar saati süresi kuyruk derinliğiyle ölçeklenir. Görev başına durum worker örneğiyle izole olduğu için olay atfı ve telemetri karışmaz.
- **Compatibility:** Varsayılan 1 → davranış birebir korunur. `status().current` tekil kalır, mevcut dört sayfa değişmeden çalışır. On bir mevcut suite değişmeden geçti.
- **Verification:** `npm test` (12 suite); eşzamanlılık testi gerçek git deposunda 2 eşzamanlı görev ölçtü ve olay atfını doğruladı.
- **Files:** `orchestrator/src/engine.js`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/config.default.json`, `orchestrator/web/index.html`, `orchestrator/web/board.html`, `orchestrator/test/concurrency.test.js`, `orchestrator/test/fake-slow-cli.js`, `orchestrator/test/fake-slow-cli.cmd`, `package.json`
