# Doctor Context

**Sources:** `orchestrator/src/doctor.js`, `orchestrator/src/cli-registry.js`, `orchestrator/package.json`

**Last verified:** 2026-07-14

## Purpose

Yerel ortamın CrewCtl'i çalıştırmaya hazır olup olmadığını terminalde teşhis eder.

## Current behavior

- Node.js ana sürümünün en az 18 olduğunu kontrol eder.
- Bilinen CLI'ları keşfeder; kurulu/eksik sürüm ve platforma uygun kurulum ipucunu gösterir.
- Config'deki operatör CLI ve etkin uzman agent'ları raporlar.
- Varsayılan çalışma salt okunurdur. `--fix`, eksik otomatik agent'ları ekleyebilir ve geçersiz operatörü düzeltebilir.
- Eski Node, hiç kurulu CLI olmaması veya operatör seçilememesi durumunda non-zero exit code ayarlar.

## Contracts and invariants

- `npm run doctor` kullanıcı config'ini sessizce değiştirmemelidir.
- Mutasyon yalnızca `--fix` ile yapılır ve yalnızca yerel `config.json` kapsamındadır.
- Doctor paket kurmaz, CLI login yapmaz ve kimlik bilgisi değiştirmez.

## Interactions

Keşif ve config iyileştirme mantığı `cli-registry`; config okuma/yazma `store` tarafındadır. `.agents/commands/doctor.md` bu modülü güvenli, varsayılan salt-okunur akışla çalıştırır.

## Verification

- `cd orchestrator && npm run doctor`
- Exit code ve config'in salt-okunur kaldığını kontrol et.

## Major Changes

Henüz kayıt yok.
