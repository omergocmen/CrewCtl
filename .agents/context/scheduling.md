# Scheduling (Zamanlanmış Görevler) Context

**Sources:** `orchestrator/src/schedule.js`, `orchestrator/src/server.js`, `orchestrator/src/store.js`, `orchestrator/web/index.html`

**Last verified:** 2026-07-18

## Purpose

Tekrar eden görevleri dostça ön ayarlarla (aralık / günlük saat / haftalık günler) otomatik
kuyruğa alan zamanlama katmanı.

## Current behavior

- `schedule.js` saf ve yan etkisizdir: `normalizeSchedule` (doğrulama), `computeNextRun`
  (sonraki çalışma zamanı, her zaman `from`'dan kesin ileri), `dueSchedules` (aktif + zamanı
  gelmiş).
- Zamanlama nesnesi: `{ id, prompt, targetDir?, operatorCli?, executionMode?, trigger, enabled,
  createdAt, lastRunAt?, nextRunAt?, lastTaskId? }`. `trigger.type` ∈ `interval|daily|weekly`
  (`everyMinutes` / `at="HH:MM"` / `days=[0..6]`).
- Zamanlamalar `config.schedules` dizisinde tutulur (kişiye özel `config.json`, gitignore).
- `server.js` her 30 sn'de (ve açılıştan ~5 sn sonra) bir zamanlayıcı tik'i çalıştırır: zamanı
  gelenler için `store.addScheduledTask` ile görev üretir, `lastRunAt`/`lastTaskId`/`nextRunAt`
  günceller, `queue` + `schedules` SSE yayınlar ve `engine.wake()` çağırır.
- CRUD kendi uçlarıyla anında kalıcılaşır: `GET/POST /api/schedules`, `PUT/DELETE
  /api/schedules/:id` (büyük `/api/config` PUT yolundan geçmez). `/api/state` yanıtına
  `schedules` eklenir; SSE olay tipi `schedules` yayınlanır.
- UI **görev kısmındadır** (Ayarlar'da değil): "Yeni görev" composer'ında **Hemen çalıştır / Zamanla
  mod anahtarı** (`setComposerMode`) vardır; ana buton (`composerSubmit`) moda göre `addTask` ya da
  `addScheduleFromComposer` çağırır — böylece dolu zamanlama alanı yanlışlıkla hemen çalıştırılmaz.
  Zamanla modunda `#schedFields` görünür ve aynı prompt/operatör/mod/klasör alanlarını paylaşır; tetik
  türüne göre koşullu alanlar (`csTypeChanged`/`csTriggerFields`). Saat **manuel yazılmaz, dropdown ile seçilir**
  (`hourOptions`/`minuteOptions`/`timeSelectHtml`); interval `INTERVAL_PRESETS` select'idir. Sidebar'daki
  "Zamanlanmış görevler" kartı (`#scheduleList`, `renderScheduleList`) mevcut zamanlamaları sonraki
  çalışma zamanı + aktif toggle + Sil ile listeler. Pano üstündeki şerit yaklaşan çalışmaları salt-okunur gösterir.

## Contracts and invariants

- **Motor duruyorsa** zamanlanan görev yalnızca `pending`e girer (manuel ekleme davranışıyla
  birebir); otomatik başlatma yoktur. `engine.wake()` yalnızca çalışan döngüyü erkenden uyarır.
- Saf hesap `schedule.js`'te; yan etkiler (task üret, broadcast, config kaydet) yalnızca
  `server.js` tik'inde. CLI `run` (panelsiz) zamanlamayı çalıştırmaz — panel özelliğidir.
- `operatorCli` verilmişse `KNOWN_CLIS` + kurulu olma doğrulaması yapılır (görev oluşturmayla
  aynı); verilmezse çalışma anında config operatörüne düşer.
- `store.normalizeConfig` `schedules`'ı diziye sabitler; yoksa `[]` (migration gerekmez).
- Reentrancy kilidi (`schedulerRunning`) tik'lerin üst üste binmesini önler; timer `unref`'lidir.

## Interactions

`store` config'i saklar ve `addScheduledTask` ile görev üretir; `schedule` hesap yapar; `server`
tik'i ve CRUD uçlarını sunar; `engine.wake()` çalışan döngüyü uyarır; `index.html` CRUD UI'ını
(görev composer'ı + sidebar listesi), `board.html` yaklaşan şeridi sunar.

## Verification

- `cd orchestrator && node test/schedule.test.js` (computeNextRun/normalize/due).
- `cd orchestrator && node test/ui-smoke.test.js` (zamanlama sekmesi assertion'ları).
- Manuel: `npm start` → Ayarlar → Zamanlama'dan "her 1 dk" tanımla; motoru başlat; görevin
  kuyruğa düşüp çalıştığını gör.

## Major Changes

### 2026-07-18 — Composer'a Hemen/Zamanla mod anahtarı

- **Change:** Composer'da ayrı "Bu görevi zamanla" butonu kaldırıldı; yerine **Hemen çalıştır /
  Zamanla** segmenti geldi. Ana buton moda göre görev ekler ya da zamanlama oluşturur.
- **Reason:** Kullanıcı zamanlama alanını doldurup büyük "Görevi Ekle"ye basınca görev saatini
  beklemeden hemen çalışıyordu (iki buton karışıyordu).
- **Impact:** Zamanla modunda görev saati gelene kadar kuyruğa hiç girmez; yanlışlıkla hemen
  çalıştırma imkânsız. Zamanlama sonrası mod otomatik "Hemen"e döner, prompt temizlenir.
- **Compatibility:** Backend değişmedi; yalnızca composer etkileşimi.
- **Verification:** `npm test`; ui-smoke `setComposerMode`/`composerSubmit`/`schedFields`.
- **Files:** `orchestrator/web/index.html`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-18 — Zamanlama görev kısmına taşındı + saat seçici

- **Change:** Zamanlama CRUD Ayarlar sekmesinden çıkarılıp "Yeni görev" composer'ına ve sidebar'daki
  "Zamanlanmış görevler" kartına taşındı. Saat artık `type=time`/metin değil
  saat+dakika dropdown'larıyla, interval ise ön ayar select'iyle seçilir. Ayarlar `data-tab="schedules"`
  sekmesi ve `renderSchedules` kaldırıldı; yerine `renderScheduleList`/`addScheduleFromComposer`/
  `csTypeChanged` geldi.
- **Reason:** Zamanlama görev oluşturmanın parçası; Ayarlar mantık dışıydı. Saati elle yazmak eskiydi.
- **Impact:** Composer prompt/operatör/mod/klasör alanları hem "Görevi Ekle" hem "Bu görevi zamanla"
  tarafından paylaşılır; oluşturulan zamanlama anında sidebar listesinde sonraki çalışma zamanıyla görünür.
- **Compatibility:** Backend/`/api/schedules` sözleşmesi değişmedi; yalnızca UI yeri ve giriş biçimi.
- **Verification:** `npm test`; canlı 1 dk interval tik'inin görevi pending'e düşürdüğü doğrulandı.
- **Files:** `orchestrator/web/index.html`, `orchestrator/test/ui-smoke.test.js`

### 2026-07-18 — Zamanlanmış görevler eklendi

- **Change:** Dostça ön ayarlı zamanlama (`schedule.js`), `config.schedules`, `/api/schedules`
  CRUD, `schedules` SSE olayı, 30 sn'lik zamanlayıcı tik'i ve Ayarlar → Zamanlama sekmesi eklendi.
- **Reason:** Tekrar eden işleri (ör. günlük test) elle eklemeden otomatik kuyruğa almak.
- **Impact:** Yeni saf modül + additive backend uçları + UI sekmesi; mevcut task/queue akışı
  değişmeden yeniden kullanılır.
- **Compatibility:** `schedules` yoksa `[]` varsayılır; motor durumu ve manuel ekleme davranışı
  korunur; otomatik motor başlatma yoktur.
- **Verification:** `npm test`; yeni `schedule.test.js` ve canlı `/api/schedules` duman testi.
- **Files:** `orchestrator/src/schedule.js`, `orchestrator/src/store.js`, `orchestrator/src/server.js`,
  `orchestrator/config.default.json`, `orchestrator/web/index.html`, `orchestrator/test/schedule.test.js`
