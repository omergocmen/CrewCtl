---
name: unit-testing
description: Saf davranışı hızlı, yalıtılmış ve dayanıklı birim testleriyle kanıtla; fonksiyon veya sınıf testlerinde kullan.
category: testing
appliesTo: [implement, review]
match: [unit test, birim testi, jest, vitest, pytest, xunit, mock, function test]
---

# Birim Testi

- Tek bir davranış ve kamuya açık giriş noktası seç; uygulama ayrıntısını test etme.
- Arrange/Act/Assert akışını belirgin tut ve test adında koşul ile beklenen sonucu yaz.
- Eşdeğer sınıfları, sınır değerleri ve hata yollarını az ama anlamlı vakayla kapsa.
- Saat, rastgelelik ve I/O bağımlılıklarını sınırda enjekte et; test edilen birimi mock'lama.
- Her test kendi verisini kursun, küresel durumu geri temizlesin ve sıra bağımsız olsun.
- Hata mesajlarının neyin bozulduğunu gösterebildiğini kontrol edip ilgili test komutunu çalıştır.
