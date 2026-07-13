# Neon Lunapark

Tarayıcıda çalışan, gece ışıklı minyatür bir 3D lunapark sahnesi. Ray üzerindeki üç vagonlu tren, dönen ve kabinleri dik kalan dönme dolap, üç farklı stant, neon giriş kemeri, yıldızlı gökyüzü ve iki atmosfer modu içerir.

## Teknoloji seçimi

- **HTML ve CSS:** Tam ekran yerleşim, erişilebilir mod düğmeleri ve cam görünümlü kontrol paneli için kullanıldı.
- **JavaScript (ES module):** Animasyon, mod geçişleri ve mouse etkileşimi herhangi bir uygulama framework'ü olmadan yazıldı.
- **Three.js 0.165.0:** WebGL sahnesi, ışıklar ve basit geometriler için sabit sürümlü ESM CDN bağlantısıyla kullanıldı. API anahtarı, backend, hazır model veya hazır görsel yoktur; görünen her nesne kod içinde kutu, silindir, küre, torus ve eğrilerle üretilir.

## Dosya yapısı

```text
lunapark/
├── index.html   # Stil, 3D sahne, etkileşimler ve animasyonlar
└── README.md    # Teknoloji, çalıştırma ve geliştirme notları
```

## Çalıştırma

Three.js CDN'den yüklendiği için ilk açılışta internet bağlantısı gerekir. En sorunsuz yöntem, proje kökünde basit bir statik sunucu başlatmaktır:

```powershell
python -m http.server 8080
```

Ardından `http://localhost:8080/lunapark/` adresini açın. Python yoksa VS Code Live Server gibi herhangi bir statik dosya sunucusu da kullanılabilir. Sahneyi sürükleyerek bakış açısını sınırlı biçimde değiştirin, tekerlekle yakınlaşın ve paneldeki düğmelerle atmosfer modunu seçin.

## Geliştirme önerileri

1. Web Audio API ile kullanıcı etkileşiminden sonra açılan, konuma göre değişen tren ve festival sesleri eklemek.
2. Ray eğrisine hız bölümleri ve istasyon beklemesi ekleyerek tren hareketini fiziksel olarak daha inandırıcı yapmak.
3. Kalite düğmesiyle gölge, yıldız ve ışık sayısını cihaz performansına göre ölçeklemek.
