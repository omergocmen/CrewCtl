---
name: secrets-management
description: Anahtar, token ve parolaları koddan ayırıp en az yetkiyle döndür; secret veya credential işlerinde kullan.
category: security
appliesTo: [plan, implement, review]
match: [secret, sır, api key, token, credential, kimlik bilgisi, password, parola, vault, rotation]
---

# Sır Yönetimi

- Sır envanterini, sahibini, tüketicisini ve gereken en dar yetkiyi belirle.
- Sırrı kod, git geçmişi, örnek config, log, hata, build artefaktı veya istemci paketinde tutma.
- Çalışma ortamının güvenli secret store/enjeksiyon mekanizmasını kullan; dosya ve process görünürlüğünü sınırla.
- Kısa ömürlü kimlik ve otomatik rotation'ı statik uzun ömürlü anahtara tercih et.
- Eksik/bozuk sırda güvenli biçimde fail et ve değeri maskeleyerek tanıla.
- Sızıntıda iptal, döndürme, geçmiş temizliği ve etki incelemesi adımlarını tanımlayıp test et.
