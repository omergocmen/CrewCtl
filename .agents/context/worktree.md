# Worktree Isolation Context

**Sources:** `orchestrator/src/worktree.js`, `orchestrator/src/engine.js` (`setupWorktree`, `finalizeWorktree`), `orchestrator/config.default.json`

**Last verified:** 2026-07-25

## Purpose

Her görevi, deponun HEAD'inden açılan **kendi git worktree'sinde ve kendi branch'inde** çalıştırır. Böylece ajanlar ana çalışma ağacını kirletmez, teslimat gözden geçirilebilir bir branch olarak kalır ve ileride görevlerin eşzamanlı koşması için mimari zemin hazırlanır.

Kullanıcı kararı (2026-07-25): **görev başına** worktree (delegasyon başına değil — birleştirme/çatışma mantığı gerektirmez) ve **branch + commit, PR elle** (uzağa hiçbir şey gönderilmez).

## Responsibilities

- `normalizeWorktreeConfig(cfg)`: saf, idempotent şema normalizasyonu; `mode` dışındaki geçersiz değerler güvenli varsayılana düşer, `linkPaths` içindeki mutlak yol ve `..` kaçışı temizlenir.
- `create(taskId, cwd, cfg)`: depo kökünü bulur, benzersiz branch adı üretir, `<ROOT>/state/worktrees/<taskId>` altına worktree açar, `linkPaths`'i bağlar ve `setupCommands`'i koşar. **Asla fırlatmaz**; `{ ok:false, reason }` döner.
- `commit(dir, message)`: worktree'deki her şeyi branch'e commit'ler. `git push` veya PR **yoktur**.
- `remove(repo, dir, branch, deleteBranch)`: worktree'yi kaldırır; branch yalnızca açıkça istenirse silinir.
- `linkArtifacts`, `runSetup`, `dirtyFiles`, `hasWork`, `uniqueBranch`, `repoRoot`, `hasCommit`.

## Contracts and invariants

- **Opt-in:** `worktree.mode` varsayılan `"off"`; kapalıyken davranış önceki sürümle birebir aynıdır.
- **Güvenli geri düşme:** git yoksa, klasör depo değilse veya HEAD yoksa motor uyarı yayınlar ve görev doğrudan çalışma klasöründe sürer. Kapı hiçbir koşulda görevi öldürmez.
- **`shell` KULLANILMAZ.** Windows'ta `shell:true` iken Node argümanları birleştirir ve tırnak koymaz; boşluk içeren commit mesajı ve yollar bölünür (aynı tuzak `cli-registry.buildCommand`'da belgeli). `git` PATH'te `git.exe` olarak çözüldüğü için shell gereksizdir.
- Worktree'ler **kullanıcının deposuna değil** CrewCtl veri köküne (`<ROOT>/state/worktrees`) açılır.
- **`_cwd` takası tek dokunuş noktasıdır:** motor `_cwd`'yi izole ağaca taşır, böylece snapshot, canlı diff, checkpoint, sandbox, ajanlar ve doğrulama kapısı kendiliğinden izole ağacı hedefler.
- **`_projectDir` ayrı tutulur:** proje profili (`.crewctl/CONTEXT.md`) özgün depoda yaşar. Çoğu depoda `.crewctl` gitignore'da olduğu için taze worktree'de bulunmaz ve bağlam sessizce kaybolurdu.
- **Kirli depo yüksek sesle bildirilir:** worktree HEAD'den oluştuğu için commit edilmemiş yerel değişiklikler ajanın gördüğü ağaçta yoktur; motor bunu hem log'a hem `delivery.warnings`'e yazar.
- **Gitignore'lanmış üretilmiş dosyalar yeni ağaçta yoktur.** İki kademeli çözüm: `linkPaths` (Windows'ta junction, yönetici hakkı gerekmez) + `setupCommands` (`npm ci` gibi). Kurulum başarısız olursa görev ölmez ama uyarı `delivery.warnings`'e girer — aksi halde doğrulama kapısı anlaşılmaz biçimde kırmızı dönerdi.
- Değişiklik yoksa worktree ve branch temizlenir (çöp bırakmamak için); başarısız görevin worktree'si **korunur** (`keepOnFailure`) ve yolu kullanıcıya bildirilir.
- Aynı görev id'si tekrar gelirse (onay sonrası devam) branch adı sayı ekiyle benzersizleştirilir.
- `setupCommands` `verify.runVerification` ile koşulur: shell, zaman aşımı, proses ağacı sonlandırma ve `CI=1` davranışı tek yerde tanımlı kalır.

## Delivery contract

Git izolasyonu kullanıldıysa `task.delivery.git` alanı üretilir: `branch`, `worktree`, `committed`, `commit` (kısa sha), `files`, `reason?`, `cleaned?`. Başarısız görevlerde `task.git` aynı bilgiyi taşır. Panelde `gitHtml()` bunu "branch hazır · uzağa gönderilmedi" olarak gösterir.

## Known limitations

- Görevler hâlâ **seri** koşar: `engine.loop()` tek görev işler ve çalışma durumu (`busy`, `_cwd`, `_snapBefore`, `activeChild`, `_usage`) Engine singleton'ındadır. Eşzamanlı görev yürütme bu durumun bir run-context nesnesine çıkarılmasını gerektirir (planlanan sonraki adım).
- `git push` / PR açma yoktur ve bilinçli olarak yoktur.
- Submodule'ler ve LFS nesneleri için özel bir işlem yapılmaz.
- Checkpoint sistemi worktree ile birlikte çalışır (izole ağacın kopyasını alır); ikisi çakışmaz ama git branch'i varken checkpoint kısmen gereksizleşir.

## Verification

- `cd orchestrator && node test/worktree.test.js` (gerçek git deposu; git kurulu değilse kendini atlar)
- `cd orchestrator && node test/server-flow.test.js` (config sözleşmesi)
- `npm test`

## Major Changes

### 2026-07-25 — Görev başına worktree izolasyonu + branch/commit eklendi

- **Change:** Yeni `src/worktree.js`, motorda `setupWorktree`/`finalizeWorktree`, `_projectDir` ayrımı, `config.worktree` şeması, `/api/config` doğrulaması, Ayarlar → Genel alanları, teslimat kartında branch satırı ve `test/worktree.test.js` (birim + gerçek depo üzerinde uçtan uca).
- **Reason:** Ajanlar kullanıcının çalışma ağacını doğrudan değiştiriyordu; teslimat gözden geçirilebilir bir git nesnesi değildi ve eşzamanlı görev için izolasyon zemini yoktu.
- **Impact:** Mod `task` iken görev izole ağaçta koşar ve kendi branch'ine commit'lenir; ana ağaç ve aktif branch değişmez. Mod `off` iken hiçbir şey değişmez.
- **Compatibility:** Varsayılan `off`; git yok/depo değil/HEAD yok durumlarında güvenli geri düşme. Mevcut on suite değişmeden geçer.
- **Verification:** `npm test` (11 suite); uçtan uca test ana ağacın korunduğunu, işin branch'te commit'lendiğini, kirli depo uyarısını ve git olmayan klasörde geri düşmeyi doğrular.
- **Files:** `orchestrator/src/worktree.js`, `orchestrator/src/engine.js`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/config.default.json`, `orchestrator/web/index.html`, `orchestrator/test/worktree.test.js`, `orchestrator/test/server-flow.test.js`, `orchestrator/test/ui-smoke.test.js`, `package.json`
