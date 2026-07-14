---
name: authentication-design
description: Kullanıcı kimliğini güvenli oturum, parola ve yeniden doğrulama akışıyla tasarla; login ve hesap güvenliğinde kullan.
category: security
appliesTo: [plan, implement, review]
match: [authentication, authn, kimlik doğrulama, login, signin, password, parola, session, mfa]
---

# Kimlik Doğrulama Tasarımı

- Yerleşik framework/kimlik sağlayıcısını tercih et; özel kriptografik protokol tasarlama.
- Kimlik belirteçlerini yüksek entropili, süreli, iptal edilebilir ve aktarımda/depoda korumalı yap.
- Parolayı güncel adaptif hash ile sakla; giriş, reset ve kayıt yanıtlarında hesap varlığını sızdırma.
- Brute force ve credential stuffing'e rate limit, gecikme, izleme ve uygun MFA ile katmanlı savunma uygula.
- Hassas işlemde yeniden doğrulama, oturum döndürme ve tüm oturumları sonlandırma desteği sağla.
- Cookie bayrakları, logout/timeout, hata ve kurtarma yollarını güvenlik testleriyle doğrula.
