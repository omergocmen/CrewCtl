---
name: refactoring
description: Dış davranışı koruyarak kod yapısını küçük ve kanıtlanabilir adımlarla iyileştir; sadeleştirme işlerinde kullan.
category: software
appliesTo: [plan, implement, review]
match: [refactor, refactoring, yeniden düzenleme, sadeleştir, simplify, cleanup, clean code, duplication]
---

# Refactoring

1. Korunacak gözlemlenebilir davranışı ve mevcut test güvenlik ağını belirle.
2. Somut kokuyu seç: tekrar, uzun işlev, yanlış sorumluluk, örtük bağımlılık veya gereksiz soyutlama.
3. Her adımda tek yapısal değişiklik yap; özellik ekleme ve davranış düzeltmesini ayrı tut.
4. Önce mevcut kavram ve yardımcıları yeniden kullan; spekülatif katman ekleme.
5. Her küçük adım sonrası ilgili test ve statik kontrolleri çalıştır.
6. Diff büyüdükçe kapsamı yeniden değerlendir; daha az kod ve daha açık bağımlılık hedefle.
