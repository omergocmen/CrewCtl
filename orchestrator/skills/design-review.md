---
name: design-review
description: UI/UX ve tasarım sistemi incelemesi — hiyerarşi, erişilebilirlik, tutarlılık ve tema uyumu
category: design
appliesTo: [review, implement]
match: [tasarim, tasarım, design, ui, ux, arayuz, arayüz, layout, renk, color, tema, theme, erisilebilir, erişilebilir, accessibility, responsive]
---

# Beceri: Tasarım İncelemesi

Bir arayüzü tek bir tasarım sistemi gibi okunacak biçimde değerlendir. Estetik yorumdan çok
gözlemlenebilir kurallara dayan.

## Kontrol listesi

- **Görsel hiyerarşi:** Başlık/gövde/aksiyon ayrımı net mi? Birincil eylem sayfada tek ve baskın mı?
- **Boşluk ve ritim:** Tutarlı bir aralık ölçeği (4/8 px) var mı? Rastgele margin/padding sıçramaları var mı?
- **Tipografi:** En fazla 2 font ailesi, sınırlı boyut/ağırlık ölçeği; satır uzunluğu 45–90 karakter.
- **Renk ve kontrast:** Metin/arka plan kontrastı WCAG AA (normal 4.5:1, büyük 3:1). Renk tek başına anlam taşımasın.
- **Tutarlılık:** Aynı işlevin bileşenleri (buton, kart, input) her yerde aynı görünsün; tek seferlik istisnalar işaretlensin.
- **Durumlar:** hover / focus / active / disabled / hata / boş / yükleniyor durumları tanımlı mı?
- **Erişilebilirlik:** Klavyeyle gezilebilir mi, görünür focus halkası var mı, etiketler/alt metinler eksik mi?
- **Tema:** Açık ve koyu temada da okunur mu? Sabit renk yerine tema değişkenleri kullanılmış mı?
- **Responsive:** Dar ve geniş ekranda taşma/kırılma var mı?

## Teslimat

Bulguları önem sırasıyla (HIGH/MEDIUM/LOW) ve mümkünse dosya:satır ile ver. Her bulgu için somut,
minimal düzeltme öner. Estetik tercihleri "kural" gibi sunma; gerekçesini yaz.
