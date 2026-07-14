---
name: database-migration
description: Üretimde güvenli, geri alınabilir ve aşamalı veri tabanı geçişi uygula; şema veya veri migration işlerinde kullan.
category: software
appliesTo: [plan, implement, review]
match: [database migration, db migration, veri tabanı geçişi, schema migration, backfill, ddl, rollback]
---

# Veri Tabanı Geçişi

- Önce mevcut şema, veri hacmi, kilit süresi ve eski uygulama sürümüyle uyumu incele.
- Expand/contract uygula: uyumlu alanı ekle, çift okuma/yazmayı geçir, veriyi doldur, sonra eskisini kaldır.
- Büyük backfill'i küçük, tekrar çalıştırılabilir partilere böl; ilerleme ve hata kaydı tut.
- Uzun tablo kilidi ve tam tablo yeniden yazımını üretim hacminde değerlendir.
- İleri geçiş, geri dönüş ve kısmi başarısızlık davranışını prova et.
- Veri kaybı riski olan adımı açık onay ve doğrulanmış yedek olmadan çalıştırma.
