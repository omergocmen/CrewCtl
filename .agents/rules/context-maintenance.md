---
name: context-maintenance
description: Keep module and page context synchronized with every repository change
alwaysApply: true
---

# Context Maintenance Rule

Bu kuralı dosya değiştirilen her görevde uygula.

1. Değişiklik yapmadan önce `.agents/context/index.md` dosyasını oku ve hedef kaynaklarla eşleşen context dosyalarını belirle.
2. Uygulama tamamlandıktan sonra `.agents/skills/context-maintainer/SKILL.md` talimatlarını uygula. Context güncellemelerini aynı teslimatın parçası say.
3. Yalnızca bu görevde değiştirilen kaynakları esas al. Önceden var olan, kullanıcıya ait ilgisiz Git değişikliklerini bu göreve mal etme.
4. Davranış, sözleşme, sorumluluk, bağımlılık, yapılandırma veya kullanıcı akışı değiştiyse ilgili context'in güncel durumunu düzelt. İnceleme sırasında eksik ya da eski bilgi görürsen kaynak kodla doğrulayıp tamamla.
5. Yeni bir modül, sayfa veya bağımsız kullanıcı akışı eklendiyse standart bir context dosyası oluştur ve `index.md` eşleme tablosuna ekle.
6. Skill'in major değişiklik ölçütünü karşılayan değişiklikleri ilgili dosyanın `Major Changes` bölümüne kaydet. Küçük iç refactor, biçimlendirme ve typo düzeltmelerini değişiklik günlüğüne ekleme.
7. Context bilgisini tahmin etme. Kaynaktan doğrulanamayan noktaları `Unknown` olarak işaretle veya context dışında bırak.
8. Yalnızca context dosyasını güncellemek yeni bir recursive context güncellemesi gerektirmez.

Kod değişikliği olup ilgili context kontrol edilmeden görevi tamamlanmış sayma.
