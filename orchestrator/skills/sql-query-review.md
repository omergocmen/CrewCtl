---
name: sql-query-review
description: SQL sorgusunu doğruluk, güvenlik, plan ve veri hacmi açısından incele; sorgu yazma veya performans işlerinde kullan.
category: software
appliesTo: [implement, review]
match: [sql, query, sorgu, explain, index, join, database performance, n+1]
---

# SQL Sorgu İncelemesi

- Parametre bağlamayı ve güvenilmeyen girdinin sorgu metnine karışmadığını doğrula.
- Join kardinalitesi, null semantiği, duplicate satır, filtre sırası ve sınır durumlarını örnek veriyle kontrol et.
- Beklenen veri hacminde EXPLAIN/planı incele; full scan, kötü tahmin ve gereksiz sort'u ara.
- Seçilen kolonları daralt, sayfalamayı kararlı sıraya bağla ve N+1 erişimi önle.
- Transaction, kilit ve eşzamanlı güncelleme etkisini yazma sorgularında değerlendir.
- İndeksi yalnızca gerçek sorgu deseniyle gerekçelendir; önce/sonra ölçümü ve doğruluk testi sun.
