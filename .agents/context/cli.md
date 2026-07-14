# CLI Context

**Source:** `orchestrator/src/cli.js`

**Last verified:** 2026-07-14

## Purpose

Web paneline gerek olmadan sunucuyu, engine'i ve dosya tabanlı görev kuyruğunu terminalden yöneten `cli-team` giriş noktasıdır.

## Current commands

- `start`: web sunucusunu başlatır.
- `doctor [--fix]`: ortam teşhisi yapar; fix verilirse keşfedilen agent/operator config'ini günceller.
- `run [--once] [--approval ask|auto]`: engine'i panelsiz çalıştırır.
- `status [--json]`: operatör, mod, agent, kuyruk ve günlük bütçe özetini verir.
- `task <hedef> [--dir] [--operator] [--mode]`: kuyruğa görev ekler.
- `approvals`, `approve <id>`, `reject <id>`: insan onayı akışını yönetir.

## Contracts and invariants

- Geçerli görev modları `auto`, `fast`, `balanced`, `deep`'tir.
- Bilinmeyen option veya değersiz option hata üretir.
- `run --once` yalnızca ilk pending görevi çalıştırır ve engine running durumunu `finally` ile kapatır.
- CLI metin çıktısı ve JSON status şeması script kullananlar için dış sözleşmedir.

## Interactions

Kuyruk ve config için `store.js`, yürütme için `engine.js`, doctor için `doctor.js`, web modu için `server.js` yüklenir.

## Verification

- `cd orchestrator && node test/cli.test.js`
- Yeni komut veya option eklenirse help metni ve CLI testini birlikte güncelle.

## Major Changes

Henüz kayıt yok.
