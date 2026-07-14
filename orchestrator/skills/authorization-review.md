---
name: authorization-review
description: Her kaynak ve işlemde sunucu tarafı erişim kararlarını denetle; rol, izin, IDOR ve yetki işlerinde kullan.
category: security
appliesTo: [implement, review]
match: [authorization, authz, yetkilendirme, permission, izin, role, rol, access control, idor, privilege]
---

# Yetkilendirme İncelemesi

1. Aktör × kaynak × işlem matrisi çıkar; varsayılanı deny yap.
2. Yetkiyi yalnızca route/UI'da değil, kaynağın sahipliği ve tenant sınırıyla veri erişiminde doğrula.
3. Kullanıcı kontrollü ID, rol, tenant veya durum alanının kararı manipüle edip etmediğini izle.
4. Yatay/dikey yetki yükseltme, toplu endpoint ve dolaylı nesne erişimini test et.
5. Admin/bakım yollarını ve arka plan işlerini aynı politikaya bağla.
6. Her izin için allow ve deny regresyon testi yaz; reddi güvenli biçimde logla, hassas ayrıntı sızdırma.
