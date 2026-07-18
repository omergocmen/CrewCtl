# CLI Context

**Source:** `orchestrator/src/cli.js`

**Last verified:** 2026-07-18

## Purpose

Web paneline gerek olmadan sunucuyu, engine'i ve dosya tabanlı görev kuyruğunu terminalden yöneten `crewctl` giriş noktasıdır.

## Current commands

- `start`: web sunucusunu başlatır.
- `doctor [--fix]`: ortam teşhisi yapar; fix verilirse keşfedilen agent/operator config'ini günceller.
- `run [--once] [--approval ask|auto]`: engine'i panelsiz çalıştırır.
- `status [--json]`: operatör, mod, agent, kuyruk ve günlük bütçe özetini verir.
- `task <hedef> [--dir] [--operator] [--mode]`: kuyruğa görev ekler.
- `approvals`, `approve <id>`, `reject <id>`: insan onayı akışını yönetir.

## Contracts and invariants

- Kök `package.json`, `@omerrgocmen/crewctl` npm paketinden `crewctl` global executable'ını yayımlar; CLI sürümünü bu manifestten okur, help metni scoped `npx`/kurulum komutlarını ve executable kullanımını birlikte gösterir.
- Geçerli görev modları `auto`, `fast`, `balanced`, `deep`'tir.
- Bilinmeyen option veya değersiz option hata üretir.
- `run --once` yalnızca ilk pending görevi çalıştırır ve engine running durumunu `finally` ile kapatır.
- CLI metin çıktısı ve JSON status şeması script kullananlar için dış sözleşmedir.

## Interactions

Kuyruk ve config için `store.js`, yürütme için `engine.js`, doctor için `doctor.js`, web modu için `server.js` yüklenir.

## Verification

- `node orchestrator/test/cli.test.js`
- Yeni komut veya option eklenirse help metni ve CLI testini birlikte güncelle.

## Major Changes

### 2026-07-14 — Global komut adı crewctl oldu

- **Change:** CLI yardım başlığı, kullanım örnekleri, bilinmeyen komut yönlendirmesi ve paket `bin` kaydı `crewctl` olarak güncellendi.
- **Reason:** Terminal giriş noktasını CrewCtl ürün adıyla tutarlı hale getirmek.
- **Impact:** Global kurulum veya `npm link` kullananlar komutları `crewctl` ile çalıştırır.
- **Compatibility:** Önceki executable için alias bırakılmadı; mevcut otomasyonların komut adını değiştirmesi gerekir.
- **Verification:** `node test/cli.test.js`, `npm run cli -- help`, `npm run cli -- version`.
- **Files:** `orchestrator/package.json`, `orchestrator/src/cli.js`, `orchestrator/test/cli.test.js`, `orchestrator/add-task.ps1`, `orchestrator/approve.ps1`
