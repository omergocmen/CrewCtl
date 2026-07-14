---
name: threat-modeling
description: Varlık, güven sınırı ve kötüye kullanım yollarından öncelikli tehditler çıkar; yeni özellik veya mimari güvenlik planında kullan.
category: security
appliesTo: [plan, review]
match: [threat model, tehdit modeli, stride, attack surface, saldırı yüzeyi, abuse case, trust boundary]
---

# Tehdit Modelleme

1. Korunacak varlıkları, aktörleri, veri akışlarını ve dış bağımlılıkları çiz.
2. Kimliğin veya verinin güven düzeyi değiştirdiği sınırları ve giriş noktalarını işaretle.
3. Spoofing, tampering, repudiation, disclosure, denial ve privilege escalation kötüye kullanımlarını somut akışlara uygula.
4. Olasılık ile etkiyi birlikte değerlendir; teorik liste yerine öncelikli saldırı yolları üret.
5. Her yüksek risk için önleme, algılama, sorumlu ve doğrulama testi tanımla.
6. Kabul edilen riski ve varsayımı kaydet; modelin kapsamını değişiklikle birlikte güncelle.
