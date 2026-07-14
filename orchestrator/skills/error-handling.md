---
name: error-handling
description: Hataları kaybetmeden sınıflandır, bağlam ekle ve güvenli biçimde kullanıcıya taşı; hata yolu tasarımında kullan.
category: software
appliesTo: [plan, implement, review]
match: [error handling, hata yönetimi, exception, istisna, retry, timeout, fallback, failure]
---

# Hata Yönetimi

1. Beklenen iş hatası, geçici altyapı hatası ve programlama hatasını ayır.
2. Hatayı yakaladığın yerde çözebiliyorsan çöz; aksi halde özgün nedeni koruyarak bağlam ekleyip ilet.
3. Kullanıcı mesajını uygulanabilir ve güvenli, log ayrıntısını tanılama için yeterli yap.
4. Retry'ı yalnızca idempotent ve geçici hatalarda, sınırlı exponential backoff ile uygula.
5. Timeout, iptal, kısmi başarı ve temizleme yollarını birinci sınıf davranış olarak ele al.
6. Boş `catch`, sessiz fallback ve hassas veri içeren stack trace kullanma; hata yollarını test et.
