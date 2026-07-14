---
name: contract-testing
description: Servis sağlayıcı ve tüketici arasındaki istek/yanıt sözleşmesini bağımsız doğrula; mikroservis ve API entegrasyonlarında kullan.
category: testing
appliesTo: [plan, implement, review]
match: [contract test, sözleşme testi, consumer driven, pact, provider, consumer, api compatibility]
---

# Sözleşme Testi

1. Tüketicinin gerçekten kullandığı alan, durum kodu ve hata davranışını çıkar.
2. Sözleşmeyi uygulama ayrıntısından bağımsız, sürümlenebilir artefakt olarak tanımla.
3. Tüketici tarafında beklentiyi, sağlayıcı tarafında gerçek uygulamaya karşı doğrulamayı çalıştır.
4. Opsiyonel alan, enum genişlemesi, null ve bilinmeyen alan toleransını açık test et.
5. Eski tüketici ile yeni sağlayıcı ve yeni tüketici ile mevcut sağlayıcı uyumunu değerlendir.
6. Sahte sunucunun gerçek protokolden sapmasını önlemek için sözleşmeyi CI yayın/verify akışına bağla.
