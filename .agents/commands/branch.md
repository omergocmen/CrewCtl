---
name: Branch
description: main'i güncelleyip yeni bir Git branch'i oluşturur
---

Bu komut, güncel `main` branch'inden yeni bir branch oluşturur.

1. Herhangi bir Git komutu çalıştırmadan önce kullanıcıya tam olarak şunu sor:

   `Branch adı ne olsun?`

   Kullanıcının yanıtını bekle. Branch adı verilmeden devam etme.

2. Verilen adı `git check-ref-format --branch <branch-adı>` ile doğrula. Geçersizse nedeni kısaca açıkla ve yeni bir ad iste.

3. `git status --porcelain` ile çalışma ağacını kontrol et. Commit edilmemiş veya izlenmeyen dosyalar varsa hiçbir değişiklik yapma; stash, reset veya clean çalıştırma. Kullanıcıya önce mevcut değişiklikleri commit etmesi ya da stash'e alması gerektiğini bildir ve dur.

4. Aşağıdaki işlemleri sırayla uygula; bir adım başarısız olursa sonraki adıma geçme:

   ```text
   git switch main
   git fetch origin
   git pull --ff-only origin main
   ```

5. Fetch tamamlandıktan sonra aynı adla yerel bir branch veya `origin` üzerinde uzak bir branch bulunup bulunmadığını kontrol et. Varsa yeni branch oluşturma; durumu bildir, farklı bir ad iste ve yeni adı yeniden doğrula.

6. `git switch -c <branch-adı>` ile branch'i oluştur.

7. Son olarak `git status --short --branch` çalıştır ve oluşturulan branch adını kullanıcıya bildir.

Komutlarda branch adını tek bir argüman olarak güvenli biçimde aktar. Kullanıcıdan açık onay almadan force, reset, clean, stash, branch silme veya merge/rebase işlemi yapma.
