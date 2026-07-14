---
name: cli-design
description: Öngörülebilir komut, bayrak, çıktı ve hata davranışı tasarla; komut satırı aracı geliştirmede kullan.
category: software
appliesTo: [plan, implement, review]
match: [cli, command line, komut satırı, flag, bayrak, argument, stdout, stderr, exit code]
---

# CLI Tasarımı

- Komut ve alt komutları kullanıcı niyetine göre adlandır; mevcut söz dizimini koru.
- Zorunlu girdiyi az tut, güvenli varsayılanlar ve açık `--help` örnekleri sağla.
- İnsan çıktısını stdout'a, uyarı/hataları stderr'e yaz; otomasyon için kararlı makine biçimi sun.
- Başarı ve farklı hata sınıfları için tutarlı çıkış kodları kullan.
- Tehlikeli veya geri döndürülemez eylemde dry-run, kapsam özeti ve açık onay düşün.
- TTY olmayan ortamı, boşluklu yolları, Unicode'u ve sinyal/iptal davranışını test et.
