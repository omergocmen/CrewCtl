---
name: database-schema-design
description: Bütünlük, sorgu biçimi ve evrim maliyetine göre veri şeması tasarla; tablo ve ilişki işlerinde kullan.
category: software
appliesTo: [plan, implement, review]
match: [database schema, veri tabanı şeması, table, tablo, relation, ilişki, index, constraint, normalization]
---

# Veri Şeması Tasarımı

1. Varlıkları, kimlikleri, kardinaliteyi, sahipliği ve yaşam döngüsünü çıkar.
2. Null, varsayılan, unique, foreign key ve check kurallarıyla bütünlüğü veriye yakın uygula.
3. Normalizasyonu başlangıç noktası al; denormalizasyonu ölçülmüş sorgu ihtiyacıyla gerekçelendir.
4. İndeksleri gerçek filtre, sıralama ve join kalıplarına göre tasarla; yazma maliyetini hesaba kat.
5. Saat dilimi, para, hassasiyet, Unicode ve silme politikasını açık seç.
6. Şemayı örnek sorgular ve evrim/migration senaryosuyla doğrula.
