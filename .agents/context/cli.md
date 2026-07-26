# CLI Context

**Source:** `orchestrator/src/cli.js`

**Last verified:** 2026-07-25

## Purpose

Web paneline gerek olmadan sunucuyu, engine'i ve dosya tabanlı görev kuyruğunu terminalden yöneten `crewctl` giriş noktasıdır.

## Current commands

- `start`: web sunucusunu başlatır.
- `doctor [--fix]`: ortam teşhisi yapar; fix verilirse keşfedilen agent/operator config'ini günceller.
- `run [--once] [--approval ask|auto]`: engine'i panelsiz çalıştırır.
- `status [--json]`: operatör, mod, agent, kuyruk ve günlük bütçe özetini verir.
- `task <hedef> [--dir] [--operator] [--mode]`: kuyruğa görev ekler.
- `mcp`: CrewCtl'i stdio üzerinden MCP sunucusu olarak sunar (başka kodlama ajanları için). Ayrıntı: `mcp-server.md`.
- `approvals`, `approve <id>`, `reject <id>`: insan onayı akışını yönetir.

## Contracts and invariants

- Kök `package.json`, `@omerrgocmen/crewctl` npm paketinden `crewctl` global executable'ını yayımlar; CLI sürümünü bu manifestten okur, help metni scoped `npx`/kurulum komutlarını ve executable kullanımını birlikte gösterir.
- Geçerli görev modları `auto`, `fast`, `balanced`, `deep`'tir.
- Bilinmeyen option veya değersiz option hata üretir.
- `run --once` yalnızca ilk pending görevi çalıştırır ve engine running durumunu `finally` ile kapatır.
- CLI metin çıktısı ve JSON status şeması script kullananlar için dış sözleşmedir.
- `mcp` komutu stdout'a **yalnızca** JSON-RPC mesajı yazar; bu yola eklenen herhangi bir `console.log` MCP istemcisinde parse hatası üretir.

## Interactions

Kuyruk ve config için `store.js`, yürütme için `engine.js`, doctor için `doctor.js`, web modu için `server.js` yüklenir.

## Verification

- `node orchestrator/test/cli.test.js`
- Yeni komut veya option eklenirse help metni ve CLI testini birlikte güncelle.

## Major Changes

### 2026-07-25 — `crewctl mcp` komutu eklendi

- **Change:** CrewCtl'i dışa dönük MCP sunucusu olarak çalıştıran `mcp` komutu ve help metnine MCP yapılandırma örneği eklendi.
- **Reason:** Başka bir kodlama ajanının (Claude Code, Codex, Gemini, OpenCode) kendi akışından CrewCtl'e iş devredebilmesi.
- **Impact:** Komut `mcp-server.js`'i yükler ve stdio'yu protokole devreder; diğer CLI komutları etkilenmedi.
- **Compatibility:** Additive; mevcut komut yüzeyi ve JSON status şeması değişmedi.
- **Verification:** `node orchestrator/test/mcp-server.test.js` (süreci gerçek istemci gibi konuşturur), `node orchestrator/test/cli.test.js`.
- **Files:** `orchestrator/src/cli.js`, `orchestrator/src/mcp-server.js`

### 2026-07-14 — Global komut adı crewctl oldu

- **Change:** CLI yardım başlığı, kullanım örnekleri, bilinmeyen komut yönlendirmesi ve paket `bin` kaydı `crewctl` olarak güncellendi.
- **Reason:** Terminal giriş noktasını CrewCtl ürün adıyla tutarlı hale getirmek.
- **Impact:** Global kurulum veya `npm link` kullananlar komutları `crewctl` ile çalıştırır.
- **Compatibility:** Önceki executable için alias bırakılmadı; mevcut otomasyonların komut adını değiştirmesi gerekir.
- **Verification:** `node test/cli.test.js`, `npm run cli -- help`, `npm run cli -- version`.
- **Files:** `orchestrator/package.json`, `orchestrator/src/cli.js`, `orchestrator/test/cli.test.js`, `orchestrator/add-task.ps1`, `orchestrator/approve.ps1`
