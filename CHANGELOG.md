# Changelog

## [1.3.0] — 2026-07-21

### 🧱 Ajan hapsi (sandbox)
- `config.json` → `sandbox.mode: "workspace"` ile ajan çalışma klasörü **dışına yazması ve ağa çıkması** OS-native olarak engellenir (Windows restricted-token+ACL, macOS Seatbelt, Linux Landlock+seccomp). Docker/Git gerektirmez.
- Codex: `-s workspace-write` argümanı eklenir; `extraWritableDirs` → `writable_roots` config'i olarak geçer.
- Claude: orkestratörün kendi dizinleri (config/memory/kurulum) `permissions.deny` ile gizlenir (path-aware, case-fold).
- Gemini/OpenCode: OS-native sandbox desteği olmadığından prompt talimatıyla sınırlandırılır.
- `"off"` modu eski davranışı korur.

### 📁 Path'e özel proje context
- Her çalışma klasörü `.crewctl/CONTEXT.md` profili tutar (global `log.md` yerine path-scoped).
- Görev açılışında profil operatöre yüklenir → tüm kodu baştan taramaya gerek kalmaz.
- Görev bitiminde **operator profili revize eder** (append değil, günceller).
- `--fresh` bayrağı / `freshContext: true` ile belirli bir görevde profil atlanır.
- `projectContext: false` ile eski global hafıza davranışına dönülür.
- `projectContextCharBudget` ile karakter sınırı ayarlanabilir (varsayılan 6000).

### 💾 OpenCode model kalıcılaştırma
- `opencode models` her açılışta yavaş/basarısız olursa **son bilinen liste** fallback olarak kullanılır.
- Panel model dropdown'ı boş kalmaz, otomatik model seçimi çalışır.
- `openCodeModelCache` config'te saklanır ve her başarılı prob sonrası güncellenir.

### 🪟 Windows shell quoting fix
- `buildCommand`'de `shell: true` iken boşluk içeren yol argümanları (ör. `--settings "C:\a b\x.json"`) cmd.exe'de ikiye bölünmesi düzeltildi.
- Kabuk metakarakteri içeren argümanlar otomatik tırnaklanır.

### 🧪 Testler
- Sandbox (workspace/off/kullanıcı bypass) testleri eklendi.
- Claude path-aware deny testleri eklendi (case-fold, iç içe/kardeş klasör).
- OpenCode model fallback testleri eklendi.
- Proje context round-trip (oku/yaz/temizle) testleri eklendi.
- Windows shell quoting testi eklendi.
