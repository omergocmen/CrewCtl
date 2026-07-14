---
name: container-review
description: Container imajını küçük, tekrarlanabilir ve en az ayrıcalıklı olacak şekilde incele; Dockerfile ve image işlerinde kullan.
category: security
appliesTo: [implement, review]
match: [dockerfile, docker, container, image, konteyner, compose, registry, base image]
---

# Container İncelemesi

- Güvenilir ve mümkünse digest ile sabitlenmiş minimal base image seç; güncelleme politikasını koru.
- Multi-stage build ile derleyici, cache ve gereksiz dosyaları çalışma imajından çıkar.
- Non-root kullanıcı, dar dosya izinleri ve yalnızca gerekli capability/port kullan.
- Sırları ARG, ENV, layer veya build context içine koyma; `.dockerignore` kapsamını kontrol et.
- Paketleri tek katmanda kurup cache'i temizle; healthcheck ve sinyal iletimini doğrula.
- İmajı build et, boyut/layer farkını ve uygulamanın salt-okunur, kısıtlı çalışma koşulunu test et.
