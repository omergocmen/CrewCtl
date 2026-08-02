Kanka işte komutlar (hepsi CrewCtl klasöründe çalıştırılır):
Çalıştırmak için:
npm start                          # panel başlatır → http://localhost:4317
Durum / teşhis:
npm run doctor                     # kurulu CLI agent'larını kontrol eder
npm run cli -- status              # motor durumunu gösterir
Görev eklemek (CLI'dan):
npm run cli -- task "Görevin metni" --mode balanced
npm run cli -- run --once          # kuyruktaki görevleri bir kez işlet
npm run cli -- approvals           # bekleyen onayları göster
Testler:
npm test
En temizi: npm start → tarayıcıda panel açılır → çalışma klasörünü seç → görev yaz → Başlat. Başlatayım mı?