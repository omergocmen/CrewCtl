# Katkı Rehberi

CrewCtl'a katkıda bulunmak istediğiniz için teşekkürler. Hata düzeltmeleri, yeni özellikler, testler, dokümantasyon iyileştirmeleri ve kullanılabilirlik önerileri memnuniyetle karşılanır.

## Katkıdan önce

- Aynı konu için daha önce bir issue veya pull request açılıp açılmadığını kontrol edin.
- Büyük özellikler, mimari değişiklikler veya yeni bağımlılıklar için kod yazmaya başlamadan önce bir issue açarak yaklaşımı tartışın.
- Güvenlik açıklarını herkese açık issue olarak paylaşmayın. Depo sahibine özel bir kanal üzerinden ulaşın.

Bir hata bildirirken işletim sistemini, Node.js sürümünü, kullandığınız CLI agent'larını, yeniden üretme adımlarını, beklenen davranışı ve gerçekleşen davranışı ekleyin. Kimlik bilgilerini, yerel dosya yollarını veya hassas logları paylaşmayın.

## Geliştirme ortamı

Node.js 18 veya daha yeni bir sürüm gereklidir.

```bash
git clone https://github.com/omergocmen/CrewCtl.git
cd CrewCtl
npm install
npm run doctor
npm test
```

Uygulamayı yerel olarak çalıştırmak için:

```bash
npm start
```

## Branch ve commit standardı

Her katkı için güncel `main` branch'inden ayrı bir branch oluşturun:

```bash
git switch main
git fetch origin
git pull --ff-only origin main
git switch -c <tür>/<kısa-açıklama>
```

Branch adlarında küçük harf ve tire kullanın. Örnekler: `feat/team-presets`, `fix/windows-cli-path`, `docs/setup-guide`.

Commit mesajlarını [Conventional Commits](https://www.conventionalcommits.org/) biçiminde ve mümkünse İngilizce yazın:

```text
feat(web): add agent status filters
fix(engine): prevent duplicate task dispatch
docs: clarify Windows setup
```

Bir commit tek bir mantıksal değişiklik içermelidir. Geçici dosyaları, yerel yapılandırmayı veya ilgisiz değişiklikleri commit'e eklemeyin.

## Kod ve test beklentileri

- Mevcut CommonJS ve sıfır runtime bağımlılık yaklaşımını koruyun. Yeni bir bağımlılık gerekiyorsa PR açıklamasında gerekçesini ve alternatifleri belirtin.
- Windows, macOS ve Linux uyumluluğunu gözetin; platforma özel yolları veya shell davranışlarını genelleştirmeyin.
- Davranış değişikliklerine uygun test ekleyin veya mevcut testleri güncelleyin.
- Kullanıcıya yansıyan davranışları ilgili README dosyasında belgeleyin.
- `orchestrator/config.json`, `.env*`, `queue/`, `state/`, yerel hafıza, loglar ve kimlik bilgileri gibi makineye özel ya da hassas verileri commit etmeyin.
- PR göndermeden önce `orchestrator` dizininde `npm test` çalıştırın.

## Pull request standardı

PR'lar küçük, odaklı ve incelenebilir olmalıdır. Birbiriyle ilgisiz değişiklikleri ayrı PR'lara bölün. Henüz hazır olmayan çalışmaları Draft PR olarak açın.

PR başlığını commit standardıyla uyumlu yazın. Açıklamada şunlar bulunmalıdır:

1. Sorunun veya ihtiyacın kısa açıklaması.
2. Uygulanan çözüm ve önemli teknik kararlar.
3. Değişikliğin nasıl test edildiği.
4. Varsa ilgili issue numarası (`Closes #123`).
5. Arayüz değişikliklerinde öncesi/sonrası ekran görüntüleri.
6. Geriye dönük uyumsuzluklar, yapılandırma değişiklikleri veya bilinen sınırlamalar.

PR göndermeden önce aşağıdaki kontrol listesini tamamlayın:

- [ ] Değişiklik tek ve anlaşılır bir amaca hizmet ediyor.
- [ ] Diff'i kendim gözden geçirdim; debug kodu ve hassas veri bulunmuyor.
- [ ] Yeni veya değişen davranış için test ekledim/güncelledim.
- [ ] `npm test` başarıyla tamamlandı.
- [ ] Gerekli dokümantasyonu güncelledim.
- [ ] PR branch'i güncel `main` ile uyumlu ve merge conflict içermiyor.

## İnceleme süreci

Bakım yapanlar değişikliğin kapsamını, testlerini, platform uyumluluğunu, güvenliğini ve bakım maliyetini değerlendirir. İnceleme yorumlarını yanıtlayın ve istenen düzeltmeleri aynı branch'e yeni commit'ler olarak gönderin. PR birleştirilirken commit'ler proje geçmişini temiz tutmak için squash edilebilir.

Katkı göndererek çalışmanızın projenin [MIT Lisansı](orchestrator/LICENSE) kapsamında yayımlanabileceğini kabul etmiş olursunuz.
