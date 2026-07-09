# Çok-Agent Görev Orkestratörü

Sürekli çalışan, görev kuyruğundan iş çekip birden fazla AI CLI'ına
(claude / gemini / codex ya da senin ekleyeceğin herhangi biri) rol dağıtarak
işleten basit bir sistem. Sıfır bağımlılık — sadece PowerShell + JSON dosyaları.

## 🖥️ Web Panel (önerilen yol)

Sıfır bağımlılık — `npm install` bile gerekmez, sadece Node 18+.

```powershell
cd C:\Users\omer.gocmen\Desktop\cli\orchestrator
npm start           # ya da: node src/server.js
```

Sonra tarayıcıda: **http://localhost:4317**

Panelden yapabildiklerin:
- **Yeni Görev** ekle (kuyruğa düşer)
- **Başlat / Durdur** — motoru çalıştır/durdur
- **ask ⇄ auto** mod anahtarı (riskli işlerde sor / sorma)
- **Canlı Akış** — her aşamanın (plan → execute → review) çıktısını anlık izle
- **Onay Bekleyen** — riskli planı gör, tek tıkla Onayla/Reddet
- **Ayarlar** — `config.json` ve `roles/*.md` dosyalarını doğrudan panelden düzenle

> PowerShell scriptleri (`orchestrator.ps1` vb.) hâlâ duruyor — panelsiz, terminalden
> çalışmak istersen alternatif. **İkisini aynı anda çalıştırma**, ikisi de aynı kuyruğu
> işler. Web panel = motor + arayüz; onu kullan.

## Akış

```
add-task.ps1  ──►  queue/pending/*.json
                        │
                        ▼
                 orchestrator.ps1  (sürekli döngü)
                        │
        ┌───────────────┴───────────────┐
        ▼               ▼                ▼
   pipeline aşamaları (config.json'da sen tanımlarsın)
   plan (gemini) → [onay kapısı] → execute (claude) → review (codex)
        │
        ▼
  queue/done | failed | approval     +     memory/log.md (ortak hafıza)
```

## Kurulum yok, direkt çalıştır

```powershell
cd C:\Users\omer.gocmen\Desktop\cli\orchestrator

# 1) Görev ekle
.\add-task.ps1 "src klasöründeki TODO yorumlarını topla ve TODO.md'ye yaz"

# 2) Orkestratörü başlat (ayrı bir terminalde açık bıraksın)
.\orchestrator.ps1              # config'teki mod (ask)
.\orchestrator.ps1 -Mode auto   # riskli işleri sormadan yap
.\orchestrator.ps1 -Once        # tek görevi işle ve çık (test için ideal)

# 3) Onaya takılan iş olursa
.\approve.ps1 -List
.\approve.ps1 -Approve <id>
.\approve.ps1 -Reject  <id>
```

## Her şeyi `config.json`'dan sen belirliyorsun

- **`agents`** — istediğin kadar isimli agent. Hepsi codex olabilir:
  ```json
  "agents": {
    "codex-plan": { "cmd": "codex", "args": ["exec"] },
    "codex-do":   { "cmd": "codex", "args": ["exec"] },
    "codex-check":{ "cmd": "codex", "args": ["exec"] }
  }
  ```
- **`pipeline`** — görev hangi aşamalardan, hangi agent'la, hangi rol dosyasıyla geçecek:
  ```json
  "pipeline": [
    { "stage": "plan",    "agent": "codex-plan",  "roleFile": "roles/planner.md",  "gate": true },
    { "stage": "execute", "agent": "codex-do",    "roleFile": "roles/executor.md" },
    { "stage": "review",  "agent": "codex-check", "roleFile": "roles/reviewer.md", "loopBackTo": "execute" }
  ]
  ```
- **`roles/*.md`** — her rolün ne yapacağını anlatan metin. Roller koda gömülü
  değil; planlayıcı/denetçi kim, ne ister, hepsi bu markdownlarda. İstediğin
  kadar rol dosyası ekle, pipeline'dan referans ver.

### Diğer ayarlar
| Ayar | Ne işe yarar |
|------|--------------|
| `approvalMode` | `ask` = riskli planı onaya takar, `auto` = sormadan yapar |
| `workingDir` | Uygulayıcının çalışacağı klasör (varsayılan: bir üst = `Desktop\cli`) |
| `maxIterationsPerTask` | Denetçi FAIL derse kaç kez tekrar denenecek |
| `dailyCallBudget` | Günlük toplam CLI çağrısı üst sınırı (maliyet koruması) |
| `pollSeconds` | Kuyruk boşken kaç saniyede bir bakılacak |
| `riskyPatterns` | Onay kapısını tetikleyen tehlikeli komut/kalıp listesi |

## Nasıl özelleştirilir

- **Agent'ın prompt'u argümanla istiyorsa:** `args` içine `{PROMPT}` koy,
  motor onu prompt ile değiştirir. Yoksa prompt stdin'den gider.
- **Yeni rol (ör. "güvenlik denetçisi"):** `roles/security.md` yaz, pipeline'a
  bir aşama daha ekle.
- **Denetim döngüsü:** denetçi rolü çıktısının son satırı `VERDICT: PASS` ya da
  `VERDICT: FAIL` olmalı — motor bunu okuyup FAIL'de `loopBackTo` aşamasına döner.

## Sürekli arka planda çalıştırma

- **En basit:** `orchestrator.ps1`'i bir terminal penceresinde açık bırak.
- **Oturum kapansa da sürsün:** Windows Görev Zamanlayıcı ile "en son oturum
  açıldığında / her X dakikada" tetikle, ya da `-Once` ile zamanlanmış çalıştır.
- **Görevleri otomatik topla:** `add-task.ps1`'i başka bir kaynaktan (mail, Telegram
  botu, dosya izleyici) çağırırsan kuyruk kendiliğinden dolar.

## Güvenlik notu
`auto` modu + geniş araç izinleri = sistem sana sormadan dosya değiştirir/komut
çalıştırır. İlk denemeleri `ask` modunda, tercihen bir git deposunda (geri
alınabilir) veya yedekli bir klasörde yap.
