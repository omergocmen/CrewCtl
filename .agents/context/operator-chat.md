# Operator Chat Context

**Sources:** `orchestrator/web/index.html`, `orchestrator/src/server.js`, `orchestrator/src/engine.js`, `orchestrator/src/store.js`, `orchestrator/roles/operator-chat.md`

**Last verified:** 2026-07-14

## Purpose

Tamamlanmış bir görevin kayıtları hakkında, yeni kod değişikliği veya delegasyon yapmadan operatöre takip sorusu sorulmasını sağlar.

## Current behavior

- Yalnızca `done` durumundaki normal görev için chat task oluşturulur; chat task üzerinden yeni chat zinciri başlatılmaz.
- Child task `kind=operator-chat`, `parentTaskId`, parent çalışma dizini ve operatör CLI bilgisini taşır.
- Engine parent prompt, delivery, dosya değişiklikleri, team state ve önceki konuşmayı `operator-chat.md` rolüyle salt okunur prompt'a dönüştürür.
- Yanıt parent task'in `conversation` dizisine eklenir; child task done/failed olur ve `result` SSE olayı gönderilir.
- Dashboard pending bubble gösterir; sonuç gelince parent task'i yeniden yükleyerek sohbet geçmişini render eder.

## Contracts and invariants

- Chat akışı dosya değiştirmez, uzman agent çağırmaz ve yeni iş planlamaz.
- Yanıt yalnızca kaydedilmiş görev kanıtına dayanır; olmayan ayrıntı uydurulmaz.
- Parent task bulunamazsa veya done değilse API 404 döner.

## Interactions

Task state `store`, prompt ve CLI çalıştırma `engine`, endpoint/SSE `server`, modal durum yönetimi dashboard tarafındadır.

## Verification

- `cd orchestrator && node test/team-flow.test.js`
- Başarılı ve başarısız chat `result` olaylarını dashboard'da kontrol et.

## Major Changes

Henüz kayıt yok.
