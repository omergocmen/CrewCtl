# CLI Team Command Center 🛰️

> **Kurulu CLI kodlama agent'larınızı — Codex, Claude Code, Gemini ve OpenCode — tek bir operatör‑liderliğindeki takım halinde çalıştıran, sıfır bağımlılıklı, yerel ve açık kaynak Node.js çok‑agent (multi‑agent) AI orkestratörü. Canlı web komuta merkezi dahil.**
>
> _A zero‑dependency, local, self‑hosted **multi‑agent AI orchestrator** that runs your installed CLI coding agents (OpenAI Codex, Claude Code, Google Gemini, OpenCode) as one **operator‑led team**, with a live web dashboard._

[![GitHub stars](https://img.shields.io/github/stars/omergocmen/cli?style=flat&logo=github)](https://github.com/omergocmen/cli/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/omergocmen/cli?style=flat&logo=github)](https://github.com/omergocmen/cli/network/members)
[![GitHub issues](https://img.shields.io/github/issues/omergocmen/cli)](https://github.com/omergocmen/cli/issues)
[![Last commit](https://img.shields.io/github/last-commit/omergocmen/cli)](https://github.com/omergocmen/cli/commits)
![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4)](https://github.com/omergocmen/cli/pulls)

🔗 **Repo:** [github.com/omergocmen/cli](https://github.com/omergocmen/cli)

Elinizde zaten **Codex CLI**, **Claude Code**, **Gemini CLI** veya **OpenCode** varsa; bu araç onları
ayrı ayrı kullanmak yerine **tek bir yapay zeka geliştirici takımı** gibi koordine eder. Bir CLI
**operatör** rolünü üstlenir; hedefinizi analiz eder, işi alt görevlere böler, doğru uzmana
**delege eder**, sonuçları değerlendirir ve gerekirse yeni tur açar — tıpkı bir teknik lider gibi.

---

## İçindekiler

- [Neden CLI Team?](#-neden-cli-team-why)
- [Öne çıkanlar](#-öne-çıkanlar-features)
- [Hızlı başlangıç](#-hızlı-başlangıç-quickstart)
- [Desteklenen CLI'lar](#-desteklenen-clilar)
- [Nasıl çalışır?](#-nasıl-çalışır)
- [Çalışma modları](#-çalışma-modları)
- [Operatör](#-operatör)
- [Agent ekleme](#-agent-ekleme)
- [Canlı görünürlük](#-canlı-görünürlük)
- [Markdown roller](#-markdown-roller)
- [Tamamlanan görevle sohbet](#-tamamlanan-görevle-sohbet)
- [Onay ve güvenlik](#-onay-ve-güvenlik)
- [Depolama](#-depolama)
- [Test](#-test)
- [SSS](#-sss-faq)
- [Bilinen sınırlar](#-bilinen-sınırlar)
- [Anahtar kelimeler](#anahtar-kelimeler--keywords)

---

## 🎯 Neden CLI Team? (Why)

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
- 🎚️ **Çalışma modları** — Otomatik / Hızlı / Dengeli / Derin ile hız‑kalite dengesi.
- 🔎 **Otomatik CLI keşfi** — kurulu araçlar tespit edilip güvenli non‑interactive varsayılanlarla eklenir.
- 📁 **Klasör seçici** — çalışma dizinini path yazmadan gözat‑ve‑seç.
- 🗂️ **Kalıcı olay geçmişi** — `state/events/*.jsonl` ile her görevin akışını yeniden oynat.
- 🛡️ **Onay/risk kapısı** — riskli planlar `ask` modunda insan onayına alınır (SHA‑256 kilitli).
- ☀️🌙 **Açık/koyu tema** ve duruma‑farkında **Başlat/Durdur** kontrolü.

## 🚀 Hızlı başlangıç (Quickstart)

**Gereksinimler:** [Node.js](https://nodejs.org) **18+** ve en az bir kurulu CLI agent'ı
(Codex, Claude Code, Gemini veya OpenCode). Başka npm bağımlılığı **yoktur**.

```bash
git clone https://github.com/omergocmen/cli.git
cd cli/orchestrator
npm install          # bağımlılık yok — yalnızca projeyi hazırlar
npm run cli -- doctor  # salt-okunur ortam kontrolü
npm run cli -- start   # sunucuyu başlatır ve tarayıcıyı açar
```

İsterseniz `npm link` ile `cli-team` komutunu sisteme bağlayın. Bundan sonra web paneli ve
headless kullanım aynı giriş noktasındadır:

```bash
cli-team status
cli-team task "Testleri düzelt" --dir .. --mode balanced
cli-team run --once
cli-team approvals
cli-team start
```

`cli-team doctor` ayarları değiştirmez. Yalnızca keşif sonucunu `config.json` dosyasına uygulamak
istediğinizde açıkça `cli-team doctor --fix` kullanın.

`npm start` çalışınca:

- `config.json` yoksa `config.default.json` şablonundan **makinenize göre otomatik** üretilir;
  kurulu CLI'lar tespit edilip uzman agent olarak eklenir ve bir operatör CLI'sı seçilir.
- Panel **`http://localhost:4317`** adresinde açılır (tarayıcı otomatik açılır; `OPEN=0 npm start`
  ile kapatabilirsiniz).
- Panelde **▶ Başlat**'a basıp bir görev gönderin.

> **İpuçları:** Farklı port için `PORT=4318 npm start`. `config.json` kişiye özeldir
> (`.gitignore`'dadır); ekip kurulumunuzu paylaşmak için `config.default.json` şablonunu
> düzenleyip commit'leyin. Ortamınızda sorun mu var? `npm run doctor` tanı verir.

## 🧰 Desteklenen CLI'lar

| CLI | Sağlayıcı | Örnek kurulum | Non‑interactive çağrı (otomatik) |
|-----|-----------|---------------|----------------------------------|
| **Codex CLI** | OpenAI | `npm i -g @openai/codex` | `codex exec --skip-git-repo-check` |
| **Claude Code** | Anthropic | `npm i -g @anthropic-ai/claude-code` | `claude -p --output-format text` |
| **Gemini CLI** | Google | `npm i -g @google/gemini-cli` | `gemini --approval-mode yolo` (stdin prompt) |
| **OpenCode** | OpenCode / çok‑sağlayıcı | `npm i -g opencode-ai` | `opencode run --auto --file <prompt.md>` |

Sunucu açılırken bu CLI'lar otomatik taranır; PATH dışında kalan yaygın kurulum dizinleri
(npm, pnpm, yarn, bun, volta, scoop, winget, Chocolatey, Homebrew…) Windows, macOS ve Linux
üzerinde de kontrol edilir. Kurulu bir CLI için henüz agent yoksa güvenli varsayılanlarla
profil eklenir. Panelde **Ayarlar → Agent'lar → Yeniden Tara** ile kurulumdan sonra yeniden
taratabilirsiniz. Prompt'u argüman olarak isteyen CLI'lar için argümanda `{PROMPT}`, dosya
olarak isteyenler için `{PROMPT_FILE}` yer tutucusu kullanılabilir.

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
kurulu bir CLI'ya geçer — böylece proje yeni indirildiğinde tek eksik CLI yüzünden görevler bloke olmaz.

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

Panelde **Ayarlar → Agent'lar → CLI Agent Ekle**. Her agent için: benzersiz **ad**, **CLI komutu**,
**argümanlar** (her satır bir argüman; prompt varsayılan olarak stdin'e gider), `roles/*.md` **rol
dosyası**, **açıklama/yetenekler** (operatörün doğru uzmanı seçmesini sağlar), **zaman aşımı**,
**maliyet sınıfı** ve **aktif** anahtarı.

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

Olaylar `state/events/<task-id>.jsonl` altında kalıcıdır; görev kartındaki **Akışı incele** düğmesi
bu geçmişi yeniden oynatır. Bir uzman CLI kullanılamazsa görev hemen başarısız sayılmaz — motor
hatayı yapılandırılmış sonuç olarak operatöre iletir ve alternatif uzman seçmesine izin verir.

## 📝 Markdown roller

Roller davranış ve uzmanlık talimatlarıdır; panelden oluşturulup agent'a atanır. Motor protokolü ve
durum yönetimi Markdown'a bağlı değildir, bu yüzden rol metni değişse bile delegasyon şeması korunur.
İyi bir uzman rolü şunları belirtir: sorumluluk alanı ve sınırlar, kullanılabilecek araçlar, kod/test
standartları, beklenen teslimat biçimi ve hangi durumda `BLOCKED` bildirileceği.

## 💬 Tamamlanan görevle sohbet

Tamamlanan görev kartındaki **Operatöre Sor** düğmesi, aynı operatörle salt‑okunur takip sohbeti açar.
Operatör; ana hedefi, takım raporlarını, dosya değişikliklerini, nihai teslimatı ve önceki soru‑cevapları
bağlam olarak görür (yeni dosya değişikliği veya delegasyon yapmaz). Teslimat kartı operatör metninden
bağımsız üretilir: kısa özet, eklenen/değiştirilen/silinen dosyalar, çalışma klasörü, kullanılan
agent'lar, tur sayısı ve doğrulama kontrolü.

## 🔒 Onay ve güvenlik

`ask` modunda riskli kalıp içeren operatör planı onaya alınır; onay planın **SHA‑256** özetiyle
ilişkilidir ve onaylanan plan aynı delegasyonlardan devam eder. `auto` modu bekletmez.

> ⚠️ Bu katman ek güvenliktir, tam sandbox değildir. CLI'ların kendi izin/sandbox ayarlarını da
> kısıtlayın ve **web panelini güvenilmeyen bir ağa açmayın** — ayar API'si CLI komutlarını değiştirebilir.

## 🗄️ Depolama

Saf dosya tabanlı, sıfır bağımlılık (SQLite/DB gerektirmez, her yerde taşınabilir). Yazımlar
atomiktir (temp + rename); runtime verisi `.gitignore`'dadır.

```text
queue/pending     bekleyen görevler
queue/approval    insan onayı bekleyen planlar
queue/done        tamamlanan görevler ve takım durumu
queue/failed      başarısız görevler
state/events      stdout, stderr, process ve mesaj olayları (JSONL)
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

## ❓ SSS (FAQ)

**Ayrı bir API anahtarı gerekiyor mu?**
Hayır. Kurulu CLI'ların kendi kimlik doğrulamasını kullanır. Yeni bir anahtar veya abonelik gerekmez.

**Hangi CLI araçlarını destekliyor?**
OpenAI Codex CLI, Anthropic Claude Code, Google Gemini CLI ve OpenCode. Prompt'u stdin/argüman/dosya
ile alan başka CLI'lar da elle eklenebilir.

**Windows, macOS ve Linux'ta çalışır mı?**
Evet. Node.js 18+ olan her yerde çalışır; CLI keşfi üç platformdaki yaygın kurulum dizinlerini tarar.

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
- Kimlik doğrulama ve uzak sunucu modu henüz eklenmemiştir.

---

## Anahtar kelimeler / Keywords

AI agent orchestrator · multi-agent orchestration · CLI agent orchestrator · operator-led agent team ·
OpenAI **Codex CLI** · **Claude Code** (Anthropic) · Google **Gemini CLI** · **OpenCode** ·
autonomous coding agents · local / self-hosted AI dev tool · zero-dependency Node.js · web command center ·
agent delegation · task orchestration · yapay zeka geliştirici takımı · çok-agent orkestratör ·
yerel yapay zeka geliştirme aracı · komut satırı ajan yönetimi.

## Lisans

[MIT](LICENSE) © CLI Team Command Center katkıda bulunanları.
