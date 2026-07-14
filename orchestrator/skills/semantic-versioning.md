---
name: semantic-versioning
description: Kamuya açık sözleşme değişimine göre major, minor veya patch sürüm etkisini belirle; paket ve release işlerinde kullan.
category: software
appliesTo: [plan, implement, review]
match: [semver, semantic versioning, sürümleme, version bump, major, minor, patch, breaking]
---

# Semantik Sürümleme

1. Önce “kamuya açık API”yi proje bağlamında tanımla: kod, CLI, şema, dosya biçimi veya davranış.
2. Uyumlu hata düzeltmesini PATCH, geriye uyumlu yeteneği MINOR, kırıcı sözleşmeyi MAJOR olarak sınıflandır.
3. `0.y.z`, prerelease ve proje-özel politikasını mevcut belgeden kontrol et; varsayma.
4. Bağımlılık güncellemesinin tüketici sözleşmesine gerçek etkisini değerlendir.
5. Sürüm kararını changelog ve migration notuyla tutarlı kıl.

Yalnızca commit türüne bakarak sürüm belirleme; gözlemlenebilir tüketici etkisini kanıtla.
