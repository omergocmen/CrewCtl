---
name: input-validation
description: Güvenilmeyen girdiyi tür, biçim, boyut ve iş kuralıyla sınırda doğrula; form, API ve parser işlerinde kullan.
category: security
appliesTo: [plan, implement, review]
match: [input validation, girdi doğrulama, sanitize, doğrula, schema validation, parser, untrusted input]
---

# Girdi Doğrulama

- Her girdinin kaynağını ve ulaşacağı hassas sink'i belirle; istemci kontrolünü güvenlik sınırı sayma.
- Tür, uzunluk, aralık, kodlama ve izin verilen biçimi allowlist yaklaşımıyla sunucuda doğrula.
- Önce kanonikleştir, sonra doğrula; Unicode, çift kodlama ve boşluk varyantlarını düşün.
- İş kurallarını ve alanlar arası koşulları şema doğrulamasından ayrı ama aynı sınırda uygula.
- SQL/komut/HTML/URL güvenliği için doğrulamaya ek olarak bağlama uygun güvenli API veya çıktı kodlama kullan.
- Hatalı, aşırı büyük ve sınır girdileri test et; kullanıcıya alan odaklı, sır sızdırmayan hata ver.
