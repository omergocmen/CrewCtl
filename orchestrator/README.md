# CrewCtl 🛰️

> **Kurulu CLI kodlama agent'larınızı — Codex, Claude Code, Gemini ve OpenCode — tek bir operatör‑liderliğindeki takım halinde çalıştıran, sıfır bağımlılıklı, yerel ve açık kaynak Node.js çok‑agent (multi‑agent) AI orkestratörü. Canlı web komuta merkezi dahil.**
>
> _A zero‑dependency, local, self‑hosted **multi‑agent AI orchestrator** that runs your installed CLI coding agents (OpenAI Codex, Claude Code, Google Gemini, OpenCode) as one **operator‑led team**, with a live web dashboard._

[![GitHub stars](https://img.shields.io/github/stars/omergocmen/CrewCtl?style=flat&logo=github)](https://github.com/omergocmen/CrewCtl/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/omergocmen/CrewCtl?style=flat&logo=github)](https://github.com/omergocmen/CrewCtl/network/members)
[![GitHub issues](https://img.shields.io/github/issues/omergocmen/CrewCtl)](https://github.com/omergocmen/CrewCtl/issues)
[![Last commit](https://img.shields.io/github/last-commit/omergocmen/CrewCtl)](https://github.com/omergocmen/CrewCtl/commits)
![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4)](https://github.com/omergocmen/CrewCtl/pulls)

🔗 **Repo:** [github.com/omergocmen/CrewCtl](https://github.com/omergocmen/CrewCtl)

Elinizde zaten **Codex CLI**, **Claude Code**, **Gemini CLI** veya **OpenCode** varsa; bu araç onları
ayrı ayrı kullanmak yerine **tek bir yapay zeka geliştirici takımı** gibi koordine eder. Bir CLI
**operatör** rolünü üstlenir; hedefinizi analiz eder, işi alt görevlere böler, doğru uzmana
**delege eder**, sonuçları değerlendirir ve gerekirse yeni tur açar — tıpkı bir teknik lider gibi.

---

## İçindekiler

- [Neden CrewCtl?](#-neden-crewctl-why)
- [Öne çıkanlar](#-öne-çıkanlar-features)
- [Hızlı başlangıç](#-hızlı-başlangıç-quickstart)
- [Desteklenen CLI'lar](#-desteklenen-clilar)
- [Nasıl çalışır?](#-nasıl-çalışır)
- [Çalışma modları](#-çalışma-modları)
- [Operatör](#-operatör)
- [Agent ekleme](#-agent-ekleme)
- [Canlı görünürlük](#-canlı-görünürlük)
- [Markdown roller](#-markdown-roller)
- [Beceriler (Skills)](#-beceriler-skills)
- [Tamamlanan görevle sohbet](#-tamamlanan-görevle-sohbet)
- [Onay ve güvenlik](#-onay-ve-güvenlik)
- [Depolama](#-depolama)
- [Test](#-test)
- [SSS](#-sss-faq)
- [Bilinen sınırlar](#-bilinen-sınırlar)
- [Anahtar kelimeler](#anahtar-kelimeler--keywords)

---

## 🎯 Neden CrewCtl? (Why)

- **Elindeki araçları kullan.** Ekstra API anahtarı veya SaaS aboneliği yok; zaten kurulu
  olan CLI agent'larının kendi oturumlarını ve sağlayıcılarını kullanır.
- **Yerel ve gizli.** Her şey kendi makinende çalışır; orkestrasyon katmanı buluta veri göndermez
  (yalnızca CLI'lar kendi sağlayıcılarıyla konuşur).
- **Sıfır bağımlılık.** Saf Node.js — `npm install` ek paket indirmez, `node_modules` şişmez.
- **Sağlayıcıları karıştır.** Aynı görevde Codex ile uygula, Claude ile incele, Gemini ile araştır.
- **Gerçek görünürlük.** Her CLI çağrısını canlı terminaliyle, süresi ve çıkış koduyla izle.
- **Her PC'de kur‑çalıştır.** Klonla → `npm start` → makinene göre otomatik yapılandırılır.

## ✨ Öne çıkanlar (Features)

- 🧠 **Operatör‑liderliğinde orkestrasyon** — bir CLI ekibi planlar, delege eder, değerlendirir.
- 🤝 **Çok‑agent takım** — Codex / Claude / Gemini / OpenCode uzmanlarını rollere göre kullan.
- 🖥️ **Canlı web komuta merkezi** — takım haritası, canlı CLI terminalleri, birleşik olay akışı.
- 🛰️ **Ekip Akışı sayfası** — operatör çekirdeği + animasyonlu delegasyon akışı + ajan filosu.
- 🧬 **Canlı Kod sayfası** — agent'ların yaptığı dosya değişikliklerini Git‑benzeri **satır‑satır diff** ile canlı izle.
- 🛟 **Otomatik sürüm + tek‑tık geri dönüş** — her görev öncesi checkpoint; beğenmezsen **Bu sürüme dön** ile önceki koda dön (redo güvenli).
- 🎚️ **Çalışma modları** — Otomatik / Hızlı / Dengeli / Derin ile hız‑kalite dengesi.
- 🔎 **Otomatik CLI keşfi** — kurulu araçlar tespit edilip güvenli non‑interactive varsayılanlarla eklenir.
- 🩺 **Hazır olma kontrolü** — OpenCode yalnızca kurulu olduğu için değil, kullanılabilir modeli keşfedildiğinde göreve alınır.
- ⏱️ **Takılma koruması** — düzenli ilerleme bilgisi, sessizlik zaman aşımı, process-tree sonlandırma ve otomatik agent fallback.
- 🧰 **CLI şablonları** — agent oluştururken CLI'ı seç; komut, argümanlar ve uygun model otomatik dolsun.
- 📁 **Klasör seçici** — çalışma dizinini path yazmadan gözat‑ve‑seç.
- 🗂️ **Kalıcı olay geçmişi** — `state/events/*.jsonl` ile her görevin akışını yeniden oynat.
- 🛡️ **Onay/risk kapısı** — riskli planlar `ask` modunda insan onayına alınır (SHA‑256 kilitli).
- ☀️🌙 **Açık/koyu tema** ve duruma‑farkında **Başlat/Durdur** kontrolü.

## 🚀 Hızlı başlangıç (Quickstart)

**Gereksinimler:** [Node.js](https://nodejs.org) **18+** ve en az bir kurulu CLI agent'ı
(Codex, Claude Code, Gemini veya OpenCode). Başka npm bağımlılığı **yoktur**.

**Tek komut — kurulum gerektirmez:**

```bash
npx @omerrgocmen/crewctl  # paneli anında başlatır (komutsuz = start)
```

> **Kaynak depo notu:** `npx` komutunu CrewCtl kaynak deposunun kendi kökünde değil, yönetmek
> istediğiniz proje klasöründe çalıştırın. Klonlanmış geliştirme kopyasında `npm start`
> kullanılır; aksi halde npm aynı isimli yerel manifesti seçip bin shim'ini bulamayabilir.

Ya da global kurun:

```bash
npm install -g @omerrgocmen/crewctl
crewctl                # panel
crewctl status
crewctl task "Testleri düzelt" --dir . --mode balanced
crewctl doctor         # salt-okunur ortam kontrolü
```

> **Veri konumu:** config, kuyruk ve görev geçmişi `~/.crewctl` altında tutulur
> (`CREWCTL_HOME` ile değiştirilebilir). Çalışma klasörü varsayılan olarak komutu çalıştırdığınız
> dizindir; panelden değiştirilebilir.

### Developer modu / uzun yol (Git clone)

Kaynak kodu geliştirmek, testleri çalıştırmak veya npm paketi yerine doğrudan Git kopyasını
kullanmak için:

```bash
git clone https://github.com/omergocmen/CrewCtl.git
cd CrewCtl
npm install
npm run cli -- doctor  # salt-okunur ortam kontrolü
npm test                # tam regresyon zinciri
npm start              # sunucuyu başlatır ve tarayıcıyı açar
```

`npm install` runtime bağımlılığı indirmez; lock/yerel npm ortamını hazırlar. Kaynaktan
çalıştırıldığında (repo `test/` klasörü mevcutken) geliştirme verileri `orchestrator/`
klasöründe tutulur.

`crewctl doctor` ayarları değiştirmez. Yalnızca keşif sonucunu `config.json` dosyasına uygulamak
istediğinizde açıkça `crewctl doctor --fix` kullanın.

> **Yeni klonladıysanız:** `config.json` ilk `npm start` anında üretilir. Ondan önce çalıştırılan
> salt-okunur `doctor`, CLI'larınızı kurulu görse bile “Operatör CLI: (yok) / Uzman ajan sayısı: 0”
> raporlar. Bu bir hata değildir; `npm start` (veya `crewctl doctor --fix`) yapılandırmayı kurar.

`npm start` çalışınca:

- `config.json` yoksa `config.default.json` şablonundan **makinenize göre otomatik** üretilir;
  kurulu CLI'lar tespit edilip uzman agent olarak eklenir ve bir operatör CLI'sı seçilir.
- Panel **`http://localhost:4317`** adresinde açılır (tarayıcı otomatik açılır; `OPEN=0 npm start`
  ile kapatabilirsiniz).
- Panelde **▶ Başlat**'a basıp bir görev gönderin.
- İlk açılışta otonom CLI çalıştırma koşullarını bir kez okuyup onaylayın. Kabul zamanı
  `config.json` içinde saklanır; aynı kurulumda uyarı tekrar gösterilmez.

> **İpuçları:** Farklı port için `PORT=4318 npm start`. `config.json` kişiye özeldir
> (`.gitignore`'dadır); ekip kurulumunuzu paylaşmak için `config.default.json` şablonunu
> düzenleyip commit'leyin. Ortamınızda sorun mu var? `npm run doctor` tanı verir.

## 🧰 Desteklenen CLI'lar

| CLI | Sağlayıcı | Örnek kurulum | Non‑interactive çağrı (otomatik) |
|-----|-----------|---------------|----------------------------------|
| **Codex CLI** | OpenAI | `npm i -g @openai/codex` | `codex exec --skip-git-repo-check` |
| **Claude Code** | Anthropic | `npm i -g @anthropic-ai/claude-code` | `claude -p --output-format text` |
| **Gemini CLI** | Google | `npm i -g @google/gemini-cli` | `gemini --approval-mode yolo` (stdin prompt) |
| **OpenCode** | OpenCode / çok‑sağlayıcı | `npm i -g opencode-ai` | `opencode run --format json --model <keşfedilen-model> --file <prompt.md>` |

Sunucu açılırken bu CLI'lar otomatik taranır; PATH dışında kalan yaygın kurulum dizinleri
(npm, pnpm, yarn, bun, volta, scoop, winget, Chocolatey, Homebrew…) Windows, macOS ve Linux
üzerinde de kontrol edilir. Kurulu bir CLI için henüz agent yoksa güvenli varsayılanlarla
profil eklenir. Panelde **Ayarlar → Agent'lar → Yeniden Tara** ile kurulumdan sonra yeniden
taratabilirsiniz. Prompt'u argüman olarak isteyen CLI'lar için argümanda `{PROMPT}`, dosya
olarak isteyenler için `{PROMPT_FILE}` yer tutucusu kullanılabilir.

Prompt hangi yolla verilirse verilsin, motor alt process'in **stdin'ini her zaman kapatır (EOF)**.
Bu şart: OpenCode gibi CLI'lar stdin bir TTY değilse mesajı borudan da okumaya çalışır ve EOF
gelmezse model çağrısına hiç geçmeden süresiz bloke olur. Kendi CLI'ınızı eklerken bu davranışa
güvenebilirsiniz.

OpenCode için “kurulu” ve “hazır” ayrı durumlardır. Orkestratör `opencode models opencode`
ile OpenCode'un kendi modellerini keşfeder, önerilen modeli profile ekler ve yanıtı JSON olay
akışından ayrıştırır. Kullanılabilir model bulunamazsa otomatik OpenCode profili devre dışı kalır;
operatör veya delegasyon sessizce ona yönlendirilmez. Model seçimi **Ayarlar → Agent'lar** ve
**Ayarlar → Operatör** bölümlerinden değiştirilebilir. Bu keşif kullanıcı adı, sabit kurulum yolu,
yerel IP veya belirli bir bilgisayar yapılandırmasına bağlı değildir.

## 🧩 Nasıl çalışır?

```text
Kullanıcı hedefi
      ↓
Seçilen operatör CLI  (roles/operator.md)
      ↓ yapılandırılmış takım planı (JSON)
Uzman A ← delegasyon → sonuç ┐
Uzman B ← delegasyon → sonuç ├→ Operatör değerlendirmesi
Uzman C ← delegasyon → sonuç ┘            ↓
                                 yeni delegasyon / tamamla
```

Agent'lar kalıcı oturumlar değildir; her delegasyon için ilgili CLI **yeni bir process** olarak
başlatılır. Takım sürekliliğini motorun tuttuğu görev durumu, mesajlar, uzman sonuçları ve proje
hafızası sağlar. Operatör hedefin tamamlandığını onaylayana ya da tur sınırına ulaşılana kadar
döngü devam eder.

## ⚙️ Çalışma modları

Her görev `Otomatik`, `Hızlı`, `Dengeli` veya `Derin` modda çalıştırılabilir:

- **Otomatik:** kısa/basit işleri Hızlı, kapsamlı işleri Dengeli moda yönlendirir.
- **Hızlı:** operatör planı + tek implementation uzmanı; başarılı teslimatta ikinci operatör
  değerlendirmesi atlanır (normal akış iki CLI çağrısı). Hata halinde en fazla iki tur.
- **Dengeli:** işi uygun uzmanlıklara dağıtır — sıfırdan uygulama/oyun/özellik gibi işlerde önce
  kısa planlama, sonra uygulama, sonra inceleme; üç uzmana ve dört tura kadar.
- **Derin:** yapılandırılmış üst sınırlarla kapsamlı uygulama ve bağımsız denetim.

## 🎩 Operatör

Operatör ayrı bir agent değil, bir **CLI seçimidir**. Seçtiğiniz CLI (Codex/Claude/Gemini/OpenCode)
o görev boyunca `roles/operator.md` rolüyle çalıştırılır; ekibi kurar, uzmanlara delege eder ve
sonuçları değerlendirir. Uzman agent'lar operatörün **altında** çalışır; bir uzmanı silmek operatörü
etkilemez. **Ayarlar → Operatör** bölümünde operatör CLI'sı, `operator.md` metni, maksimum tur ve
tur başına delegasyon sınırı yönetilir; her görevde farklı bir operatör de seçilebilir.

Yapılandırılan operatör o cihazda kurulu değilse, sunucu açılışta ve her taramada otomatik olarak
kurulu ve hazır bir CLI'ya geçer. OpenCode kurulu olsa bile kullanılabilir modeli yoksa operatör
olarak seçilmez; elle model seçilmişse bu seçim korunur. Böylece proje yeni indirildiğinde tek eksik
veya yapılandırılmamış CLI yüzünden görevler bloke olmaz.

Operatör yanıtları serbest metin değil **JSON protokolüdür**. İlk tur takım planı:

```json
{
  "summary": "Yaklaşım",
  "completionCriteria": ["Testler geçmeli"],
  "assignments": [
    { "id": "implement-api", "agent": "backend-codex", "kind": "implement", "instruction": "API'yi uygula ve test et", "dependsOn": [] }
  ]
}
```

Sonraki turlarda ya yeni delegasyon üretir (`{"status":"continue","assignments":[...]}`) ya da
görevi tamamlar (`{"status":"complete","final":"...","verification":"..."}`). Geçersiz JSON
yapılandırılan sayıda otomatik tekrar edilir. Delegasyon türleri `implement`, `review`, `research`
ve `plan`'dır; motor türü görev metninden ayrıca doğrular ve yanlış rol seçilirse yeteneği uygun
aktif agente otomatik yönlendirir.

## ➕ Agent ekleme

Panelde **Ayarlar → Agent'lar → Yeni CLI agent** bölümünden önce CLI şablonunu seçin. Komut,
non-interactive varsayılan argümanlar, yetenekler, rol ve destekleniyorsa model otomatik dolar.
Bu nedenle daha önce sildiğiniz bir CLI'ı yeniden eklerken varsayılan komutları hatırlamanız gerekmez.
Her agent için: benzersiz **ad**, **CLI komutu**,
**argümanlar** (her satır bir argüman; prompt varsayılan olarak stdin'e gider), `roles/*.md` **rol
dosyası**, **açıklama/yetenekler** (operatörün doğru uzmanı seçmesini sağlar), **zaman aşımı**,
**maliyet sınıfı** ve **aktif** anahtarı.

Otomatik keşfedilmiş bir Gemini/OpenCode profilini silerseniz adapter tercihi
`discoveryIgnoredAdapters` içinde saklanır ve **Yeniden Tara** sırasında geri gelmez. İsterseniz
**Gizlenenleri geri getir** ile bu kararı kaldırabilirsiniz; elle oluşturulmuş profillere dokunulmaz.

```json
{
  "backend-codex": {
    "cmd": "codex",
    "args": ["exec", "--skip-git-repo-check"],
    "description": "Node.js API ve veritabanı uzmanı",
    "capabilities": ["node", "api", "postgres", "testing"],
    "roleFile": "roles/backend.md",
    "costTier": "high",
    "timeoutSeconds": 1200
  }
}
```

## 📊 Canlı görünürlük

Panel her CLI çağrısını ayrı kartta gösterir: canlı **stdout/stderr**, process başlangıcı, süresi
ve çıkış kodu; operatör→uzman delegasyonları, uzman→operatör sonuçları, agent takım haritası ve
kimlik doğrulama/kota/timeout/CLI‑bulunamadı hataları için sade hata kartları. Ayrı **🛰️ Ekip Akışı**
sayfası; parlayan operatör çekirdeği, ajan filosu ve animasyonlu delegasyon akışıyla "arkada bir
ekibin çalıştığı" hissini verir.

Ayrı **🧬 Canlı Kod** sayfası, agent'lar çalışırken çalışma klasöründe oluşan/değişen/silinen dosyaları
Git ekranına benzer biçimde **satır satır** gösterir: dosya bazında +/− sayaçları, hunk başlıkları,
eklenen/silinen/bağlam satırları ayrı renklerle. "Şu an ne oluyor" satırı aktif agent'ı, üst kutucuklar
toplam değişikliği özetler. Sayfa açıldığında aktif (veya son tamamlanan) görevin geçmiş diff'i otomatik
yüklenir; hassas (`.env` vb.), ikili veya çok büyük dosyaların içeriği güvenlik için gizlenir. Diff, görev
başındaki tabana göre **kümülatif**tir. Görev kartındaki **Kodu gör** düğmesi de o görevin farkını bu
sayfada açar.

Olaylar `state/events/<task-id>.jsonl` altında kalıcıdır; görev kartındaki **Akışı incele** düğmesi
bu geçmişi yeniden oynatır. Bir uzman CLI kullanılamazsa görev hemen başarısız sayılmaz — motor
hatayı yapılandırılmış sonuç olarak operatöre iletir ve alternatif uzman seçmesine izin verir.

Çalışan CLI 15 saniyede bir süre/ilerleme olayı üretir. OpenCode varsayılan olarak 180 saniye,
diğer CLI'lar 300 saniye boyunca hiçbir çıktı üretmezse `CLI_STALLED` olarak sınıflandırılır;
Windows'ta alt process ağacıyla birlikte durdurulur, o oturum için karantinaya alınır ve uygun
başka agent varsa görev onunla sürdürülür. Sağlayıcı bağlantı hataları `PROVIDER_UNAVAILABLE`
olarak ayrı gösterilir; bozuk JSON sanılıp anlamsız protokol tekrarlarına sokulmaz.

**Sessizlik sınırı toplam süre sınırı değildir.** Sayaç her stdout/stderr parçasında sıfırlanır,
yani düzenli çıktı üreten bir CLI ne kadar uzun çalışırsa çalışsın kesilmez — OpenCode `--format json`
ile her araç çağrısında `step_start` / `tool_use` / `step_finish` olayı yayınladığı için aktif
kodlarken sessizlik sınırına yaklaşmaz. Bir çalışmayı gerçekten sınırlayan değer ayrı olan **toplam
zaman aşımıdır**: agent'ın `timeoutSeconds` alanı (OpenCode profillerinde varsayılan **1800 sn**,
diğerlerinde 1200 sn). Saatler sürecek işler planlıyorsanız değiştirmeniz gereken değer budur.

## 📝 Markdown roller

Roller davranış ve uzmanlık talimatlarıdır; panelden oluşturulup agent'a atanır. Motor protokolü ve
durum yönetimi Markdown'a bağlı değildir, bu yüzden rol metni değişse bile delegasyon şeması korunur.
İyi bir uzman rolü şunları belirtir: sorumluluk alanı ve sınırlar, kullanılabilecek araçlar, kod/test
standartları, beklenen teslimat biçimi ve hangi durumda `BLOCKED` bildirileceği.

## 🧠 Beceriler (Skills)

Roller bir agentın **kim** olduğunu (uygulayıcı/denetçi/planlayıcı) tanımlar; **beceriler** ise bir
işin **nasıl** yapılacağını anlatan yeniden kullanılabilir prosedür rehberleridir — `skills/*.md`
altında frontmatter'lı Markdown dosyaları. Dağıtım; yazılım, test, güvenlik, dokümantasyon, SEO ve
arayüz tasarımını kapsayan **60 yerel beceri** içerir. Hiçbiri API anahtarı veya harici ücretli servis
gerektirmez.

Beceriler **kullanıcı-kapılıdır**: yalnızca **Ayarlar → Beceriler** bölümünde etkinleştirdikleriniz
taranır. Motor, tüm etkin kataloğu her çağrıda prompta yığmak yerine görev metni ve delegasyon türüne
göre puanlayıp sabit bütçeli bir kısa listeyi operatöre verir. Operatör uygun adları `skills` alanıyla
iliştirir; alanı atlarsa `autoMatch` aynı seçimi yerel olarak yapabilir. Uzman yalnızca kısa açıklama ve
mutlak rehber yolunu görür, tam Markdown gövdesini gerçekten gerekiyorsa dosyadan okur. Hiçbir beceri
etkin değilse davranış eskisi gibi kalır.

```json
"skills": {
  "enabled": ["design-review", "write-tests", "seo-technical-audit"],
  "autoMatch": true,
  "catalogLimit": 12,
  "maxSkillsPerAssignment": 3,
  "charBudget": 2400,
  "referenceCharBudget": 1200
}
```

`charBudget` operatör kısa listesini, `referenceCharBudget` uzman promptundaki ad/açıklama/yol
referanslarını sınırlar. Yeni beceri aynı bölümden (veya `skills/` klasörüne `.md` ekleyerek)
oluşturulabilir. Frontmatter alanları: `name`, `description`, `category`, `appliesTo`
(implement/review/plan/research) ve eşleştirme için `match`.

## 💬 Tamamlanan görevle sohbet

Tamamlanan görev kartındaki **Operatöre Sor** düğmesi, aynı operatörle salt‑okunur takip sohbeti açar.
Operatör; ana hedefi, takım raporlarını, dosya değişikliklerini, nihai teslimatı ve önceki soru‑cevapları
bağlam olarak görür (yeni dosya değişikliği veya delegasyon yapmaz). Teslimat kartı operatör metninden
bağımsız üretilir: kısa özet, eklenen/değiştirilen/silinen dosyalar, çalışma klasörü, kullanılan
agent'lar, tur sayısı ve doğrulama kontrolü.

## 🔒 Onay ve güvenlik

İlk açılışta uygulama, CLI'ların non-interactive/otonom modda çalıştırılacağını açıklayan tek
seferlik bir onay gösterir. Kabul edilmeden motor başlatılamaz veya görev yürütülemez. Kabul zamanı
`config.json` içindeki `autonomousConsentAcceptedAt` alanında tutulur; yapılandırma silinmediği
sürece tekrar sorulmaz.

Bu onaydan sonra adapter varsayılanları CLI içinde bekleyen etkileşimli izin sorularını azaltır:
Gemini `--approval-mode yolo`, Claude `--permission-mode acceptEdits`, OpenCode ise process ortamında
`{"permission":{"*":"allow"}}` kullanır. Codex non-interactive `exec` modunda çalışır. Kullanıcı
elle değiştirdiği agent argümanlarının ve CLI'ın kendi sürüm/yapılandırmasının davranıştan sorumlu
olduğunu unutmamalıdır.

Orkestratörün görev-planı güvenlik kapısı ayrıca çalışır: `ask` modunda riskli kalıp içeren plan
onaya alınır; onay planın **SHA‑256** özetiyle ilişkilidir ve aynı delegasyonlardan devam eder.
`auto` modu bu plan onayını bekletmez.

**Otomatik sürümleme (checkpoint) ve geri dönüş.** `versioning` açıkken (varsayılan) CrewCtl, her görev
_çalışmadan önce_ çalışma klasörünün bir sürümünü alır. Klasör bir Git deposuysa yedeklenecek dosyalar
`git ls-files` ile (yani `.gitignore`'a uyularak) belirlenir, değilse güvenli bir tarama kullanılır — her
iki durumda da depolama birebir dosya kopyasıdır. Tamamlanan/başarısız görev kartındaki **Bu sürüme dön**
(veya Canlı Kod sayfasındaki **Önceki sürüme dön**) eylemi, görev sonrası oluşan dosyaları siler ve
değiştirilen/silinen dosyaları eski haline getirir. Geri yükleme öncesinde mevcut durum için bir **redo**
checkpoint'i oluşturulur; böylece geri alma da geri alınabilir. Sürümler `state/checkpoints/` altında
tutulur (`versioningRetention`, varsayılan 20 sürüm/klasör) ve yalnızca motor **boşta** iken geri yüklenir.
Bu, Git yerine geçmez; kritik iş için normal sürüm kontrolünüzü sürdürün.

> ⚠️ Otonom çalışma onayı bir sandbox değildir. Agent'lar çalışma klasöründeki dosyaları değiştirebilir,
> komut çalıştırabilir ve CLI'ın verdiği yetki ölçüsünde daha geniş sisteme erişebilir. İzole çalışma
> klasörü/repo kullanın, önemli dosyaları sürüm kontrolünde tutun ve **web panelini güvenilmeyen bir
> ağa açmayın** — ayar API'si CLI komutlarını değiştirebilir.

## 🗄️ Depolama

Saf dosya tabanlı, sıfır bağımlılık (SQLite/DB gerektirmez, her yerde taşınabilir). Yazımlar
atomiktir (temp + rename); runtime verisi `.gitignore`'dadır.

```text
queue/pending     bekleyen görevler
queue/approval    insan onayı bekleyen planlar
queue/done        tamamlanan görevler ve takım durumu
queue/failed      başarısız görevler
state/events      stdout, stderr, process ve mesaj olayları (JSONL)
state/checkpoints görev‑öncesi otomatik sürümler (tek‑tık geri dönüş için)
memory/log.md     görevler arası kısa proje hafızası
roles             operatör ve uzman Markdown rolleri
config.json       makineye özel yapılandırma (gitignore)
config.default.json  paylaşılabilir şablon
```

## 🧪 Test

```bash
npm test
```

Gerçek sağlayıcı çağrısı yapmadan, sahte operatör ve uzman CLI process'leriyle
planlama → delegasyon → mesaj → dosya değişikliği → operatör tamamlama akışını uçtan uca doğrular.
Testler ayrıca OpenCode JSON olay ayrıştırmasını, doğru izin yapılandırmasını, model önceliğini,
hazır olmayan OpenCode'un devre dışı kalmasını, sessizlik watchdog'unu ve operatör fallback'ini kapsar.
Sahte OpenCode process'i gerçeği taklit ederek stdin'i EOF'a kadar okur; böylece stdin'i kapatmayan
bir regresyon (CLI'ın hiç çalışmadan asılı kalması) testlerden sessizce geçemez.

## ❓ SSS (FAQ)

**Ayrı bir API anahtarı gerekiyor mu?**
Hayır. Kurulu CLI'ların kendi kimlik doğrulamasını kullanır. Yeni bir anahtar veya abonelik gerekmez.

**Hangi CLI araçlarını destekliyor?**
OpenAI Codex CLI, Anthropic Claude Code, Google Gemini CLI ve OpenCode. Prompt'u stdin/argüman/dosya
ile alan başka CLI'lar da elle eklenebilir.

**Windows, macOS ve Linux'ta çalışır mı?**
Evet. Node.js 18+ olan her yerde çalışır; CLI keşfi üç platformdaki yaygın kurulum dizinlerini tarar.

**OpenCode kurulu ama neden “model seçilmeli” görünüyor?**
`opencode models opencode` kullanılabilir bir model döndürmemiştir. Önce `opencode auth login` ile
sağlayıcı girişini tamamlayın, ardından panelde **Ayarlar → Agent'lar → Yeniden Tara**'ya basın.
İsterseniz agent veya operatör için erişilebilir modeli elle de seçebilirsiniz. Hazır olmayan
OpenCode'a otomatik görev verilmez.

**Bir CLI çalışıyor mu, takıldı mı nasıl anlarım?**
Canlı karttaki süre ve 15 saniyelik ilerleme olayları çalışmayı görünür kılar. Çıktısız bekleme
sessizlik sınırını aşarsa process otomatik durdurulur, açık hata gösterilir ve mümkünse başka
agent'a geçilir. Uzun ama düzenli çıktı üreten işler normal zaman aşımı sınırına kadar sürebilir.

**Bağımlılık kuruyor mu / node_modules şişer mi?**
Hayır, sıfır bağımlılık. `npm install` yalnızca projeyi hazırlar.

**Verilerim buluta gidiyor mu?**
Orkestrasyon tamamen yereldir. Yalnızca CLI'lar kendi sağlayıcılarıyla (ör. OpenAI/Anthropic/Google) konuşur.

**Aynı görevde birden çok modeli birlikte kullanabilir miyim?**
Evet. Örn. Codex ile uygula, Claude ile incele, Gemini ile araştır — operatör işi uygun uzmana dağıtır.

**SQLite veya bir veritabanı kurmam gerekir mi?**
Hayır. Depolama düz JSON/JSONL dosyalarıdır; her makinede taşınabilir ve atomik yazılır.

## 🚧 Bilinen sınırlar

- Delegasyonlar şimdilik aynı çalışma klasöründe güvenli biçimde **sırayla** yürütülür.
- CLI'a özgü tool‑call telemetrisi yoksa yalnızca stdout/stderr görülebilir.
- Proje hafızası metin tabanlıdır; semantik retrieval henüz yoktur.
- Model keşfi sağlayıcının gerçek bir üretim çağrısını başlangıçta çalıştırmaz; sonradan oluşan ağ,
  kota veya sağlayıcı hatası ilk çağrıda gösterilir ve fallback akışına alınır.
- Web paneli kimlik doğrulaması ve uzak sunucu modu henüz eklenmemiştir.

---

## Anahtar kelimeler / Keywords

AI agent orchestrator · multi-agent orchestration · CLI agent orchestrator · operator-led agent team ·
OpenAI **Codex CLI** · **Claude Code** (Anthropic) · Google **Gemini CLI** · **OpenCode** ·
autonomous coding agents · local / self-hosted AI dev tool · zero-dependency Node.js · web command center ·
agent delegation · task orchestration · yapay zeka geliştirici takımı · çok-agent orkestratör ·
yerel yapay zeka geliştirme aracı · komut satırı ajan yönetimi.

## Lisans

[MIT](LICENSE) © CrewCtl katkıda bulunanları.
