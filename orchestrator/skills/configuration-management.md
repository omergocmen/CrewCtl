---
name: configuration-management
description: Güvenli varsayılanlı, doğrulanabilir ve katmanlı uygulama yapılandırması kur; config ve environment işlerinde kullan.
category: software
appliesTo: [plan, implement, review]
match: [config, configuration, yapılandırma, ayar, environment, env, feature setting, default]
---

# Yapılandırma Yönetimi

1. Kaynak önceliğini açık tanımla: varsayılan, dosya, ortam değişkeni, CLI ve çalışma zamanı.
2. Yapılandırmayı sınırda tür, aralık ve ilişki kurallarıyla doğrula; hatayı alan adıyla ver.
3. Güvenli varsayılan kullan; sırları örnek dosyaya, loga veya istemci paketine koyma.
4. Eski alanları idempotent biçimde taşı ve bilinmeyen alan politikasını belirle.
5. Etkin yapılandırmayı sırları maskeleyerek teşhis edilebilir kıl.
6. Eksik, bozuk, eski ve çakışan değerler için test yaz.
