---
name: release-readiness
description: Bir sürümün kalite, güvenlik, geçiş ve geri dönüş hazırlığını kanıtlarla denetle; yayın öncesinde kullan.
category: software
appliesTo: [plan, review]
match: [release readiness, sürüm hazırlığı, go live, production release, yayın, deploy checklist, rollout]
---

# Sürüm Hazırlığı

- Kapsamı ve kabul kriterlerini sürüm adayındaki gerçek commit/artefaktla eşleştir.
- Zorunlu test, build, güvenlik ve uyumluluk kontrollerinin güncel kanıtını doğrula.
- Yapılandırma, sır, migration, veri yedeği ve bağımlı servis ön koşullarını kontrol et.
- Kademeli rollout, sağlık metriği, gözlem süresi, durdurma eşiği ve geri alma adımını tanımla.
- Changelog, kullanıcı iletişimi, runbook ve destek sahipliğini doğrula.
- Bilinmeyenleri risk/etki/sahip ile kaydet ve sonunda READY, CONDITIONAL veya NOT READY kararı ver.
