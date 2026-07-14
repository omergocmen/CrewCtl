---
name: accessible-forms
description: Formları etiket, klavye, hata ve yardım davranışıyla erişilebilir kur; input, validation ve checkout işlerinde kullan.
category: design
appliesTo: [plan, implement, review]
match: [accessible form, erişilebilir form, input, form, label, validation error, checkout, aria-describedby]
---

# Erişilebilir Formlar

- Her kontrolü görünür ve programatik label ile eşleştir; placeholder'ı label yerine kullanma.
- Doğru native input türü, autocomplete, inputmode ve fieldset/legend seç.
- Talimat ile hata metnini kontrole bağla; hatayı yalnız renk ile gösterme ve düzeltme yolunu söyle.
- Gönderimde hata özetine/failing alana yönetilebilir focus taşı; girilmiş veriyi koru.
- Klavye sırası DOM akışını izlesin, focus görünür olsun ve özel kontrol native davranışı taklit etsin.
- Zoom, ekran okuyucu, klavye, mobil ve sunucu tarafı validation ile akışı uçtan uca doğrula.
