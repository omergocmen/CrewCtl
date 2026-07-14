# Store Context

**Source:** `orchestrator/src/store.js`

**Last verified:** 2026-07-14

## Purpose

Sıfır bağımlılıkla config, roller, dosya tabanlı görev kuyruğu, kalıcı olaylar, hafıza ve günlük CLI çağrı sayacını yönetir.

## Current behavior

- Runtime dizinlerini `queue/{pending,approval,done,failed}`, `memory`, `state/events` olarak oluşturur.
- JSON yazımlarını temp-file + rename ile atomik yapar.
- Task ID'si zaman damgası ve rastgele son ekten oluşur; görevler state klasörleri arasında taşınır.
- Approval sırasında `planPreview` hash'ini kontrol ederek değiştirilmiş planı reddeder.
- Run olaylarını task başına JSONL olarak saklar; UI geçmişi yeniden oynatabilir.
- Memory Markdown dosyalarını karakter bütçesine göre sondan kırpmış olarak okur.

## Contracts and invariants

- Store kökü `orchestrator/` dizinidir.
- State adları `pending`, `approval`, `done`, `failed` ile sınırlıdır.
- `moveTask` hedefi önce yazar, sonra kaynağı siler; crash durumunda görev kaybını azaltır.
- Rol okuma/yazma/silme işlemleri dosya adını basename'e indirger.
- Config ve runtime verileri kullanıcıya özeldir; `.gitignore` kapsamında kalmalıdır.

## Interactions

CLI, server ve engine aynı store API'sini kullanır. Config şeması için `configuration.md`; görev yaşam döngüsü için `tasks.md` ve `engine.md` context'lerine bak.

## Verification

- `cd orchestrator && node test/cli.test.js`
- `cd orchestrator && node test/team-flow.test.js`

## Major Changes

Henüz kayıt yok.
