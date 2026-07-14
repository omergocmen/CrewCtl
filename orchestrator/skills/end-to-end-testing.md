---
name: end-to-end-testing
description: Kritik kullanıcı yolunu gerçek sistem sınırları boyunca güvenilir E2E testle doğrula; UI ve tam akış testlerinde kullan.
category: testing
appliesTo: [implement, review]
match: [e2e, end to end, uçtan uca, playwright, cypress, browser test, kullanıcı akışı]
---

# Uçtan Uca Test

1. İş değeri yüksek, katmanlar arası tek bir kullanıcı yolunu seç; her ayrıntıyı E2E'ye taşıma.
2. Testi erişilebilir rol, etiket ve görünen sonuçlarla sür; kırılgan CSS veya zamanlama seçicilerinden kaçın.
3. Veriyi API/fixture ile deterministik kur, testler arasında benzersizleştir ve temizle.
4. Sabit sleep yerine gözlemlenebilir koşulu bekle; retry ile gerçek flakiness'i gizleme.
5. Başarısızlıkta ekran görüntüsü, trace, ağ ve uygulama logunu sakla.
6. En az bir hata/izin yolunu ekleyip testi temiz ortamda tekrarlı çalıştır.
