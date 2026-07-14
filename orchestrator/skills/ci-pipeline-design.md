---
name: ci-pipeline-design
description: Hızlı, deterministik ve en az yetkili CI doğrulama hattı tasarla; build, test ve workflow işlerinde kullan.
category: software
appliesTo: [plan, implement, review]
match: [ci, pipeline, workflow, github actions, build, continuous integration, sürekli entegrasyon, job]
---

# CI Hattı Tasarımı

1. Birleştirmeyi engelleyen asgari kontrolleri belirle: biçim, statik analiz, test, build ve güvenlik.
2. Bağımsız işleri paralelleştir; pahalı işleri değişen dosya veya riskle koşullandır.
3. Sürümleri sabitle, önbellek anahtarlarını lockfile ile bağla ve temiz ortamda deterministik çalıştır.
4. İş akışına yalnızca gereken izinleri ver; güvenilmeyen PR koduyla sırları buluşturma.
5. Hata çıktısını uygulanabilir yap, geçici ağ hatalarıyla gerçek test hatalarını ayır.
6. Yerelde eşdeğer komutu belgeleyip hattı gerçek bir çalıştırmayla doğrula.
