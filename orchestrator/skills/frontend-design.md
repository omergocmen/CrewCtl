---
name: frontend-design
description: Cilalı, tutarlı ve erişilebilir arayüz kurma rehberi — tasarım token'ları, bileşen ve durum disiplini
category: design
appliesTo: [implement]
match: [ui, arayuz, arayüz, frontend, react, css, html, component, bilesen, bileşen, sayfa, landing, dashboard, tasarla]
---

# Beceri: Ön Yüz Tasarımı

Arayüzü tek seferlik stiller yerine yeniden kullanılabilir bir sistemle kur.

## İlkeler

- **Token'lardan başla:** Renk, aralık, yarıçap, gölge ve tipografi için değişken/token tanımla; ham
  hex ve sihirli piksel değerlerini bileşenlere serpme.
- **Aralık ölçeği:** 4/8 px tabanlı tutarlı bir ölçek kullan.
- **Bileşen bazlı:** Buton, input, kart gibi tekrar edenleri tek bir bileşene indir; kopyalama yapma.
- **Tüm durumları uygula:** hover, focus-visible, active, disabled, hata, boş ve yükleniyor.
- **Erişilebilirlik varsayılan olsun:** Anlamlı HTML, `label`/`aria`, klavye erişimi, görünür focus, AA kontrast.
- **Responsive:** Akışkan düzen; sabit genişlik yerine min/max ve `clamp`. Küçük ekranı da test et.
- **Tema uyumu:** Açık/koyu tema varsa iki temada da doğrula; sabit renk yerine token kullan.
- **Hareket ölçülü:** Kısa, amaçlı geçişler; `prefers-reduced-motion` desteğini unutma.

## Sınırlar

Mevcut tasarım dilini ve bileşen kütüphanesini koru; gerekçesiz yeni bir stil sistemi ya da ağır
bağımlılık ekleme. Değişikliği tarayıcıda görünür biçimde doğrula ve ne test ettiğini raporla.
