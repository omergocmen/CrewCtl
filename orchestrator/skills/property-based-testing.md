---
name: property-based-testing
description: Çok sayıda üretilmiş girdide değişmezleri ve sınırları doğrula; parser, dönüşüm ve algoritma testlerinde kullan.
category: testing
appliesTo: [implement, review]
match: [property based testing, property test, özellik tabanlı test, quickcheck, hypothesis, fast-check, invariant, fuzz]
---

# Özellik Tabanlı Test

- Örnek çıktılar yerine değişmezi tanımla: round-trip, idempotency, sıralama, korunum veya referans model.
- Üreticiyi geçerli alanı temsil edecek şekilde kur; boş, uç, Unicode ve büyük değerleri ağırlıklandır.
- Geçersiz girdiyi ayrı özellikte ve beklenen hata sınıfıyla test et.
- Küçültmenin anlaşılır minimal karşı örnek ürettiğini kontrol et.
- Seed ve başarısız örneği kaydet; regresyon için sabit örneğe dönüştür.
- Sonsuz/çok pahalı vakaları boyut sınırıyla denetle ve özelliğin hatalı uygulamayı gerçekten yakaladığını sınayarak doğrula.
