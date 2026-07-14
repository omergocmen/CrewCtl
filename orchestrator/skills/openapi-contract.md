---
name: openapi-contract
description: HTTP API davranışını doğrulanabilir OpenAPI sözleşmesine dönüştür; API şeması, istemci üretimi ve contract işlerinde kullan.
category: software
appliesTo: [plan, implement, review]
match: [openapi, swagger, api contract, api sözleşmesi, spec, schema, endpoint documentation]
---

# OpenAPI Sözleşmesi

- Uygulamanın desteklediği OpenAPI sürümünü ve mevcut düzenini koru.
- Her operation için kararlı kimlik, özet, parametre, istek gövdesi, başarı ve hata yanıtı tanımla.
- Required, nullable, format, enum, sınır ve örnekleri gerçek çalışma zamanı doğrulamasıyla eşleştir.
- Ortak şemaları yeniden kullan; aşırı kalıtım ve belirsiz serbest nesnelerden kaçın.
- Kimlik doğrulama, sayfalama, idempotency ve hata modelini açıkça göster.
- Spec'i linter/validator ile doğrula ve uygulama testleriyle sözleşme sapmasını yakala.
