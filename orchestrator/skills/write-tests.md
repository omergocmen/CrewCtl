---
name: write-tests
description: Değişen davranış için hedefli, güvenilir test yazma ve çalıştırma disiplini
category: testing
appliesTo: [implement, review]
match: [test, tests, jest, pytest, mocha, vitest, coverage, kapsam, birim, unit, e2e, dogrula, doğrula]
---

# Beceri: Test Yazma

Testin amacı davranışı kanıtlamaktır; yeşil göstermek değil.

## Yaklaşım

- **Davranışı test et, uygulamayı değil:** Gözlemlenebilir girdi→çıktı ve yan etkilere odaklan; iç
  ayrıntıya kilitlenen kırılgan testlerden kaçın.
- **Önce risk:** En olası hata yollarını ve sınır durumlarını (boş, sıfır, negatif, çok büyük, eşzamanlı,
  hatalı girdi) kapsa. Mutlu yol tek başına yetmez.
- **Bağımsız ve deterministik:** Testler sıralamadan, saatten, ağdan ve paylaşılan durumdan bağımsız olsun;
  dış bağımlılıkları uygun yerde taklit et (mock/fake).
- **Tek iddia teması:** Her test tek bir davranışı doğrulasın; isim ne test edildiğini anlatsın.
- **Mevcut düzene uy:** Projenin test çatısını, klasör ve adlandırma kurallarını izle.

## Doğrulama

Testleri gerçekten çalıştır ve sonucu raporla. Yeni testin, düzeltmeden önce **kırmızı** olup düzeltmeden
sonra **yeşile** döndüğünü mümkünse göster. Testi geçirmek için üretim kodunu bozma veya kontrolü gevşetme.
Çalıştırılamayan testi "geçti" gibi sunma; nedenini belirt.
