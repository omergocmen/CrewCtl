---
name: empty-error-loading-states
description: Boş, hata, yükleniyor ve kısmi başarı durumlarını eyleme dönük tasarla; veri getiren arayüzlerde kullan.
category: design
appliesTo: [plan, implement, review]
match: [empty state, boş durum, error state, hata durumu, loading, yükleniyor, skeleton, retry, partial]
---

# Arayüz Durumları

- İlk kullanım boşluğu, filtre sonucu boşluğu, izin yokluğu ve gerçek veri yokluğunu farklı ele al.
- Yüklenirken düzeni sabit tut; bilinmeyen süre için ilerleme/skeleton, uzun işlem için durum ve iptal sun.
- Hata metninde ne olduğunu, kullanıcı etkisini ve güvenli sonraki eylemi söyle; teknik ayrıntıyı sızdırma.
- Retry yalnız güvenliyse göster; girilmiş veri ve önceki başarılı içeriği mümkünse koru.
- Kısmi başarıyı tüm ekran hatası gibi sunma; güncellik ve eksik bölümü açık işaretle.
- Durumları gerçek gecikme, offline, 401/403/404/429/5xx ve dar ekran koşullarında test et.
