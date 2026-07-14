---
name: supply-chain-security
description: Kaynak, bağımlılık, build ve yayın zincirinde bütünlük ve en az yetkiyi denetle; paket ve CI güvenliğinde kullan.
category: security
appliesTo: [plan, implement, review]
match: [supply chain, tedarik zinciri, sbom, provenance, dependency confusion, package security, artifact signing]
---

# Tedarik Zinciri Güvenliği

1. Kaynaktan yayınlanan artefakta kadar repository, runner, registry ve paket güven sınırlarını çıkar.
2. Bağımlılık kaynağını/lockfile bütünlüğünü doğrula; namespace ve dependency confusion riskini kontrol et.
3. CI eylemlerini ve araç sürümlerini sabitle, izinleri daralt, güvenilmeyen koddan sırları ayır.
4. Build'i temiz ortamda tekrarlanabilir yap; SBOM/provenance ve artefakt checksum/imza üretimini değerlendir.
5. Yayın kimliğini kısa ömürlü ve onaylı kullan; registry sahipliği ile kurtarma hesaplarını koru.
6. İhlal halinde paket iptali, anahtar rotation ve tüketici iletişimi yolunu belgeleyip doğrula.
