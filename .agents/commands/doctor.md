---
name: Doctor
description: Projenin Node.js, CLI agent ve yapılandırma sağlığını kontrol eder
---

Projenin geliştirme ortamını salt okunur biçimde kontrol et.

1. Depo kökünü ve `orchestrator/package.json` dosyasını bul. Bulamazsan komut çalıştırma; doğru proje klasörünün açılması gerektiğini bildir.
2. Mevcut Git değişikliklerine dokunma. Stash, reset, clean, checkout veya dosya düzenleme işlemi yapma.
3. `orchestrator` dizininde `npm run doctor` çalıştır ve çıkış kodunu kaydet.
4. Sonucu şu başlıklarla özetle:
   - Node.js 18+ uygunluğu
   - Codex, Claude, Gemini ve OpenCode kurulum durumu
   - Seçili operatör CLI
   - Etkin uzman agent sayısı
   - Engelleyici sorunlar ve uygulanabilir düzeltme önerileri
5. Doğrulanmamış bir aracı hazır gösterme. Komut başarısız olduysa kısa hata kanıtını ve çıkış kodunu belirt.

Varsayılan kontrol salt okunurdur. `$ARGUMENTS` içinde açıkça `fix` istenirse, `npm run doctor -- --fix` komutunun yerel `orchestrator/config.json` dosyasını değiştirebileceğini önceden söyle ve kullanıcıdan onay almadan çalıştırma. Paket kurma, oturum açma, kimlik bilgisi değiştirme veya global ayar yazma işlemlerini otomatik yapma.
