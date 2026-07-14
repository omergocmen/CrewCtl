# Tasks Context

**Sources:** `orchestrator/web/index.html`, `orchestrator/src/server.js`, `orchestrator/src/store.js`, `orchestrator/src/engine.js`

**Last verified:** 2026-07-14

## Purpose

Görev oluşturma, pending/approval/done/failed kuyruklarını görüntüleme, bekleyen görevi düzenleme/silme, plan onaylama ve geçmiş teslimatı inceleme akışını kapsar.

## Current behavior

- Yeni görev prompt, operatör CLI, `auto|fast|balanced|deep` modu ve isteğe bağlı çalışma klasörüyle oluşturulur.
- Queue snapshot pending, approval, done ve failed listelerini taşır; geçmiş tamamlanan/başarısız gruplara ayrılır.
- Yalnızca pending görev düzenlenebilir. Hedef değişikliği eski planı, approval'ı ve team state'i siler.
- Aktif görev silinemez; approval görevi plan hash'i değişmemişse onaylanabilir.
- Tamamlanan görev kartı teslimat özeti, dosya değişiklikleri, doğrulama, uyarılar, run olayları ve operatör sohbetine erişim sağlar.

## Contracts and invariants

- Task ID kalıcı state/event dosyalarının anahtarıdır.
- `executionMode` geçersizse server `auto` kullanır.
- Görev başlatma için operatör CLI kurulu ve sağlıklı olmalıdır.
- Task CRUD sonrası server yeni queue snapshot'ını SSE ile yayınlar.

## Interactions

Kalıcı state `store`, yürütme `engine`, HTTP doğrulaması `server`, render ve kullanıcı eylemleri dashboard tarafındadır.

## Verification

- `cd orchestrator && node test/cli.test.js`
- `cd orchestrator && node test/team-flow.test.js`
- `cd orchestrator && node test/ui-smoke.test.js`

## Major Changes

Henüz kayıt yok.
