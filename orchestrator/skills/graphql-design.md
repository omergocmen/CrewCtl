---
name: graphql-design
description: İstemci odaklı, evrilebilir ve maliyeti denetlenebilir GraphQL şeması tasarla; query, mutation ve resolver işlerinde kullan.
category: software
appliesTo: [plan, implement, review]
match: [graphql, query, mutation, resolver, schema, federation, dataloader]
---

# GraphQL Tasarımı

- Şemayı veri tablosuna değil alan diline göre adlandır; nullability sözleşmesini bilinçli seç.
- Query'leri yan etkisiz, mutation sonuçlarını hata ve güncel nesneyle kullanılabilir yap.
- Liste alanlarında kararlı cursor sayfalama ve açık filtre/sıralama girdileri kullan.
- N+1 sorguyu batching/caching ile önle; resolver maliyeti, derinlik ve karmaşıklık sınırı koy.
- Yetkiyi yalnızca UI veya üst resolver'a bırakma; veri erişim sınırında doğrula.
- Alan kaldırmak yerine deprecate et, şema değişimini tüketici sorguları ve entegrasyon testleriyle doğrula.
