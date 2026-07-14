---
name: debugging
description: Kök neden bulma disiplini — belirtiyi değil nedeni düzelt
category: software
appliesTo: [implement]
match: [hata, bug, debug, hata ayikla, ayıkla, crash, cokme, çökme, exception, fix, duzelt, düzelt, sorun, patlama]
---

# Beceri: Hata Ayıklama

Rastgele deneme yerine hipotez–kanıt döngüsü yürüt.

## Yöntem

1. **Yeniden üret:** Hatayı tetikleyen en küçük, deterministik adımı bul. Üretilemeyen hata düzeltilemez.
2. **Daralt:** Hatanın olduğu ve olmadığı yeri ikiye bölerek (log, ara değer, git bisect mantığı) izole et.
3. **Kök nedeni bul:** "Neden?" diye zincirle sor. İlk gördüğün belirtiyi değil, onu üreten nedeni hedefle.
4. **En küçük düzeltme:** Kök nedeni gideren minimal değişikliği yap; ilgisiz refactor ekleme.
5. **Regresyona karşı test:** Mümkünse hatayı yakalayan bir test ekle; düzeltme öncesi kırmızı, sonrası yeşil olsun.
6. **Yan etkiyi kontrol et:** Düzeltmenin başka bir davranışı bozmadığını doğrula.

## Kurallar

- Belirtiyi maskeleyen çözümlerden (boş `catch`, kontrolü kapatma, sihirli bekleme) kaçın.
- Bulduğun kök nedeni ve neden bu düzeltmenin doğru olduğunu kısaca raporla.
- Düzeltilemiyorsa (yeniden üretilemiyor, erişim yok) bunu somut kanıtla `BLOCKED` olarak bildir.
