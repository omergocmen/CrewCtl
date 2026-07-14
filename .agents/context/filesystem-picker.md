# Filesystem Picker Context

**Sources:** `orchestrator/web/index.html`, `orchestrator/src/server.js`

**Last verified:** 2026-07-14

## Purpose

Görev ve genel ayarlar için yerel çalışma klasörünü, tarayıcının doğrudan dosya sistemi erişimine ihtiyaç duymadan seçtirir.

## Current behavior

- Modal geri, üst klasör, adres düzenleme, breadcrumb, hızlı erişim, sürücüler ve klasör listesi sunar.
- UI `GET /api/fs?path=...` ile gezinir; dosyalar seçim hedefi değil, klasörler gezinme/seçim hedefidir.
- Server Windows'ta mevcut sürücüleri, diğer platformlarda kök dizini ve home gibi yerleri sunar.
- Açılamayan yol uygulamayı bozmaz; uyarıyla bilgisayar/kök görünümüne döner.

## Contracts and invariants

- API yalnızca dizin metadata'sı döndürür; dosya içeriği okumaz veya dosya sistemi mutasyonu yapmaz.
- Seçim callback'i modalı açan input'a uygulanır.
- Yol işlemleri platform ayraçlarını ve Windows sürücü köklerini korumalıdır.

## Interactions

Task composer/edit modal ve Genel Ayarlar bu picker'ı kullanır. Endpoint sahipliği `server-api.md` altındadır.

## Verification

- Yerel dashboard'da açma, geri/üst gezinme, adres girişi ve klasör seçimini kontrol et.
- `cd orchestrator && node test/ui-smoke.test.js`

## Major Changes

Henüz kayıt yok.
