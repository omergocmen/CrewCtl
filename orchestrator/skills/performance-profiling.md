---
name: performance-profiling
description: Performans sorununu ölçüm ve profil kanıtıyla bulup en dar darboğazı düzelt; yavaşlık ve optimizasyon işlerinde kullan.
category: software
appliesTo: [plan, implement, review, research]
match: [performance, performans, profiling, profile, yavaş, slow, latency, cpu, memory, benchmark]
---

# Performans Profilleme

1. Kullanıcı etkisini ve başarı eşiğini tanımla; süre, throughput, bellek veya kaynak metriğini seç.
2. Temsilî veri ve ısınma koşuluyla tekrarlanabilir baseline ölç.
3. CPU, allocation, I/O, sorgu veya ağ profilinden baskın maliyeti bul; tahmine göre kod değiştirme.
4. En dar nedeni hedefleyen küçük optimizasyon yap ve davranışı koruyan testleri çalıştır.
5. Aynı koşulda önce/sonra dağılımını karşılaştır; tek ölçümü sonuç sayma.
6. Kazanç, ödünleşim, veri boyutu ve kalan darboğazı raporla; ölçülmeyen “hızlandı” iddiası kurma.
