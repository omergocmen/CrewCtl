---
name: observability-design
description: Log, metrik ve trace sinyallerini kullanıcı etkisi ve tanılama sorularına göre tasarla; gözlemlenebilirlik işlerinde kullan.
category: software
appliesTo: [plan, implement, review]
match: [observability, gözlemlenebilirlik, telemetry, metric, metrik, trace, tracing, logging, monitoring]
---

# Gözlemlenebilirlik Tasarımı

1. Önce yanıtlanacak operasyon sorularını yaz: ne bozuldu, kim etkilendi, nerede yavaşladı?
2. Trafik, hata, gecikme ve doygunluk için az sayıda anlamlı metrik seç.
3. İstek/iş kimliğini log ve trace boyunca taşı; yapılandırılmış, aranabilir alanlar kullan.
4. Yüksek kardinaliteli kullanıcı/veri alanlarını metrik etiketi yapma; hassas veriyi kaydetme.
5. Başarı kadar reddedilen, timeout olan ve retry edilen yolları da ölç.
6. Sinyali dashboard/uyarı tüketicisiyle ve kontrollü hata senaryosuyla uçtan uca doğrula.
