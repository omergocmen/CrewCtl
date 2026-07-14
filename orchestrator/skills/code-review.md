---
name: code-review
description: Doğruluk, sadeleştirme, yeniden kullanım ve okunabilirlik odaklı kod incelemesi
category: software
appliesTo: [review]
match: [inceleme, review, kod, refactor, temiz, clean, okunabilir, kalite, quality, denetle]
---

# Beceri: Kod İncelemesi

Değişikliği iddia değil kanıt olarak sorgula. Önce doğruluk, sonra sadelik.

## Öncelik sırası

1. **Doğruluk:** Mantık hataları, sınır durumları, yarış koşulları, hatalı varsayımlar, ele alınmayan
   hata yolları. Somut bir "şu girdide şu bozulur" senaryosu kurabiliyor musun?
2. **Sadeleştirme & yeniden kullanım:** Tekrarlayan mantık, gereksiz soyutlama, mevcut yardımcı yerine
   yeniden yazılmış kod, ölü kod.
3. **Okunabilirlik:** İsimlendirme, işlev boyutu, örtük bağımlılık, yanıltıcı yorum.
4. **Kapsam:** Değişiklik istenen işi mi yapıyor, yoksa ilgisiz alanlara mı taşıyor?

## Kurallar

- Yalnızca gerçekten gözlemlediğin sorunları raporla; stil tercihini "hata" gibi sunma.
- Her bulgu için dosya:satır ve minimal, uygulanabilir düzeltme öner.
- Mevcut kullanıcı değişikliklerini, mimariyi ve stili koru; gereksiz büyük refactor önerme.
- Sonunda net bir karar ver: `VERDICT: PASS` veya `VERDICT: FAIL` ve en kritik bulguları özetle.
