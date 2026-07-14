---
name: backward-compatibility
description: API, veri ve davranış değişikliklerinde mevcut tüketicileri koru; kırıcı değişiklik veya yükseltme işlerinde kullan.
category: software
appliesTo: [plan, implement, review]
match: [backward compatibility, geriye uyumluluk, breaking change, kırıcı değişiklik, deprecation, migration, upgrade]
---

# Geriye Uyumluluk

1. Dış sözleşmeleri çıkar: API, CLI bayrağı, dosya biçimi, olay, şema ve varsayılan davranış.
2. Mevcut tüketicinin yeni sürümle çalışıp çalışmadığını somut örneklerle sınayarak kırılmayı bul.
3. Alan ekleme, toleranslı okuma, adaptör veya aşamalı kullanımdan kaldırma ile uyumluluğu koru.
4. Kaçınılmaz kırılmada sürümleme, geçiş yolu, uyarı dönemi ve geri alma planı sağla.
5. Eski ve yeni biçimi aynı test matrisinde doğrula.

Sessiz anlam değişikliğini uyumlu sayma; aynı şeklin farklı davranması da kırıcı olabilir.
