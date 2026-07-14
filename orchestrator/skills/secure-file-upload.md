---
name: secure-file-upload
description: Dosya yüklemeyi tür, boyut, ad, depolama ve sunum sınırlarıyla güvenli kur; upload ve attachment işlerinde kullan.
category: security
appliesTo: [plan, implement, review]
match: [file upload, dosya yükleme, attachment, multipart, mime, image upload, path traversal]
---

# Güvenli Dosya Yükleme

1. İzin verilen iş amaçlı türleri, dosya/adet boyutunu ve kullanıcı kotasını allowlist ile sınırla.
2. Uzantı, MIME ve magic byte'ı birlikte kontrol et; istemci adına veya Content-Type'a güvenme.
3. Sunucu tarafında rastgele dosya adı üret, yolu kanonikleştir ve web root dışında depola.
4. İçeriği mümkünse yeniden kodla/tara; arşiv açmada oran, derinlik ve yol sınırı uygula.
5. İndirmeyi güvenli header, ayrı origin ve yetki kontrolüyle sun; aktif içeriği inline çalıştırma.
6. Eksik, sahte, büyük, çift uzantılı ve eşzamanlı yükleme vakalarını test et.
