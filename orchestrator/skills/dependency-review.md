---
name: dependency-review
description: Yeni veya güncellenen bağımlılığın güvenlik, lisans, bakım ve paket boyutu etkisini incele; paket değişimlerinde kullan.
category: software
appliesTo: [plan, implement, review]
match: [dependency, bağımlılık, package, paket, lockfile, npm, pip, cargo, license, lisans, upgrade]
---

# Bağımlılık İncelemesi

- Önce ihtiyacın mevcut standart kütüphane veya kurulu paketle çözülüp çözülemeyeceğini kontrol et.
- Manifest ve lockfile farkında doğrudan/dolaylı paketleri, kaynak ve bütünlük değişimlerini incele.
- Bakım etkinliği, sürüm politikası, lisans, bilinen açık ve çalışma zamanı ayrıcalıklarını değerlendir.
- İstemci tarafında paket/bundle maliyetini; sunucuda başlangıç ve tedarik zinciri etkisini ölç.
- Minimum uyumlu sürümü seç, sürümü kilitle ve kullanım yüzeyini küçük tut.
- Güncellemeden sonra test, build ve güvenlik taramasını çalıştır; körlemesine büyük lockfile farkı kabul etme.
