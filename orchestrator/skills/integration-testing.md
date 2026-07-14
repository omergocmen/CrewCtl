---
name: integration-testing
description: Bileşen sınırları ve gerçek adaptörler arasındaki sözleşmeleri doğrula; servis, veri tabanı ve entegrasyon testlerinde kullan.
category: testing
appliesTo: [implement, review]
match: [integration test, entegrasyon testi, database test, service test, adapter, repository, boundary]
---

# Entegrasyon Testi

- En yüksek riskli sınırı seç: veri tabanı, dosya sistemi, kuyruk, HTTP istemcisi veya servis adaptörü.
- Üretime benzeyen gerçek bileşeni kullan; yalnızca kontrol edemediğin dış uçları fake et.
- Şema, serileştirme, transaction, hata çevirisi ve timeout davranışını gözlemlenebilir sonuçla doğrula.
- Test verisini her test için yalıt; sıra, saat, ağ ve önceki koşudan bağımsız çalıştır.
- Başlangıç/temizleme kodunu güvenilir kıl ve başarısızlıkta tanılama çıktısını koru.
- Mutlu yol yanında kopuk bağlantı, çakışma ve kısmi başarısızlık senaryosu ekle.
