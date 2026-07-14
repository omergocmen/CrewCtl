---
name: api-design
description: Tutarlı, öngörülebilir ve sürüm-güvenli HTTP/REST API tasarımı rehberi
category: software
appliesTo: [implement, plan]
match: [api, endpoint, rest, http, route, controller, backend, servis, service, sozlesme, sözleşme, contract]
---

# Beceri: API Tasarımı

API'yi bir sözleşme gibi tasarla: tutarlı, tahmin edilebilir ve kırmadan geliştirilebilir.

## İlkeler

- **Kaynak odaklı yollar:** Çoğul isimler (`/users/{id}/orders`), fiil değil. HTTP metodunu doğru kullan
  (GET okur, POST oluşturur, PUT/PATCH günceller, DELETE siler).
- **Doğru durum kodları:** 200/201/204, 400/401/403/404/409/422, 5xx. Hataları tutarlı bir gövde şemasıyla döndür.
- **Tutarlı sözleşme:** Alan adlandırması, tarih formatı (ISO 8601), sayfalama, filtreleme ve sıralama her yerde aynı.
- **Girdi doğrulama:** Sınırda doğrula; net, alanı belirten hata mesajları ver. Güvenilmeyen girdiye güvenme.
- **Idempotency & yan etki:** GET yan etkisiz olsun; tekrar denenebilir işlemlerde idempotency düşün.
- **Sürümleme & geriye uyumluluk:** Kırıcı değişiklikten kaçın; gerekiyorsa sürümle. Alan ekle, sessizce kaldırma.
- **Güvenlik:** Kimlik/yetki her hassas yolda; hassas veriyi yanıtta ve logda sızdırma.

## Teslimat

Endpoint'i mevcut API stiliyle uyumlu uygula, girdi/çıktı şemasını netleştir ve davranışı testle doğrula.
Sözleşmeyi (yol, metot, gövde, kodlar) kısaca belgele.
