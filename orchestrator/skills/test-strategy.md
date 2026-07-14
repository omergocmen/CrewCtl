---
name: test-strategy
description: Riski doğru test katmanına dağıtan yalın bir doğrulama stratejisi kur; özellik veya proje planlamasında kullan.
category: testing
appliesTo: [plan, implement, review]
match: [test strategy, test plan, test stratejisi, kalite planı, coverage, test pyramid, doğrulama planı]
---

# Test Stratejisi

1. Kritik kullanıcı akışlarını, güven sınırlarını ve en pahalı hata türlerini sırala.
2. Saf mantığı birim, bileşen sınırını entegrasyon, az sayıdaki kritik akışı uçtan uca testlere ver.
3. Güvenlik, performans, erişilebilirlik ve migration gibi işlev dışı riskleri ayrıca ele al.
4. Her risk için gözlemlenebilir oracle, veri ihtiyacı ve çalıştırma katmanı belirle.
5. Hızlı PR kapısı ile daha pahalı gece/release kontrollerini ayır.
6. Kapsam yüzdesi yerine yakalanan risk, güvenilirlik ve tanılama kalitesini ölç.
