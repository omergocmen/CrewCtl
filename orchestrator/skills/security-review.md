---
name: security-review
description: Değişiklikleri yaygın güvenlik açıkları açısından denetleme rehberi (OWASP odaklı)
category: security
appliesTo: [review]
match: [guvenlik, güvenlik, security, auth, kimlik, yetki, injection, xss, csrf, secret, token, sql, sifre, şifre, zafiyet]
---

# Beceri: Güvenlik İncelemesi

Salt okunur denetle; kanıtla göster. Teorik risk yerine bu kod tabanında sömürülebilir yolları ara.

## Kontrol alanları

- **Girdi doğrulama & injection:** SQL/NoSQL/komut/şablon injection; parametreli sorgu ve güvenli API kullanımı.
- **Çıktı kodlama & XSS:** Kullanıcı verisi güvenli kaçışla mı render ediliyor; `dangerouslySetInnerHTML`/`eval` var mı?
- **Kimlik & yetki:** Kimlik doğrulama ve yetki kontrolü her hassas yolda var mı? IDOR / eksik erişim kontrolü?
- **Sırlar:** Kod, log veya istemciye sızan API anahtarı, parola, token var mı? `.env`/secret yönetimi doğru mu?
- **Veri akışı:** Güvenilmeyen girdinin dosya yolu, komut, URL veya deserializasyona ulaştığı yerler.
- **Bağımlılık & yapılandırma:** Bilinen zafiyetli paket, güvensiz varsayılan, açık CORS, eksik güvenlik başlıkları.
- **Kripto & rastgelelik:** Zayıf hash/şifreleme, tahmin edilebilir token, sabit IV/anahtar.

## Teslimat

Her bulgu için: önem (HIGH/MEDIUM/LOW), dosya:satır, sömürü senaryosu ve somut düzeltme. Yıkıcı test veya
gerçek exploit **çalıştırma**; yalnızca statik inceleme yap. Sonunda `VERDICT: PASS` veya `VERDICT: FAIL` yaz.
