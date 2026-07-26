# Inbound MCP Context

**Sources:** `orchestrator/src/mcp.js`, `orchestrator/src/engine.js` (`runCli` materyalizasyonu, `agentCatalog`), `orchestrator/src/cli-registry.js` (`agentEnvironment`), `orchestrator/config.default.json`, `orchestrator/web/index.html` (MCP sekmesi)

**Last verified:** 2026-07-25

## Purpose

Uzman ajanlara **harici araç** verir (tarayıcı, veritabanı, doküman arama). Bu, MCP'nin *içe dönük* yönüdür — CrewCtl istemci, karşı taraf sunucudur. Dışa dönük yön (CrewCtl'in kendisinin MCP sunucusu olması) ayrı modüldür: `mcp-server.md`.

## Katman modeli

```
Katman 1  SERT KAPI    kinds ∩ agents ∩ kimlik bilgisi   config'ten; model ASLA genişletemez
Katman 2  MATERYALİZE  adapter'a özgü argüman/ortam      engine.runCli'de tek nokta
```

`mcp.js` **saf planlayıcıdır**: dosya yazmaz, proses başlatmaz. Materyalizasyonu (dosya yazma) motor yapar — sandbox `--settings` ile aynı noktada ve aynı gerekçeyle (Windows `cmd.exe` JSON argümanının tırnaklarını bozar).

## Rol kapısı

Anthropic'in kanonik çok-ajan modeliyle örtüşür (*"Tools, MCP servers, and context are not shared"*; örnekte yalnızca researcher GitHub MCP'yi tanımlar, koordinatörün erişimi yoktur).

| Rol / kind | Erişim | Gerekçe |
| --- | --- | --- |
| **operator** | **YOK** | Çıkışı katı JSON protokolü (araç kullanımı kanalı kırılganlaştırır); en çok çağrılan rol olduğu için boot maliyeti orada çarpılır; zemin gerektiğinde **delege eder** — `plan`/`research` türleri bunun için var |
| executor (`implement`) | Tam | İşi yapan tek rol |
| planner (`plan`) · reviewer (`review`) · `research` | Salt okunur sunucular | `planner.md` zaten salt okunur keşif araçlarına izin verir; `reviewer.md`'nin `NOT RUN` kaçış kapısını gerçek kanıta çevirir |

Bağlama için ayrı bir sistem yoktur: `allowedKinds` rol→tür bağlamasını zaten zorunlu kıldığı için sunucuyu `kinds`'a bağlamak onu role bağlamaktır.

## Contracts and invariants

- **Opt-in:** `mcp.enabled` varsayılan `false`; kapalıyken hiçbir argüman/ortam değişmez.
- **Operatör kind taşımaz** → `resolveForAssignment` kind yoksa boş liste döner. Operatörün MCP alması mimari olarak imkânsızdır, yapılandırmayla açılamaz.
- **`write: true` sunucu `review`/`research`/`plan` türlerine hiçbir koşulda verilmez.** Bu kural config'ten değil **koddan** gelir (`READ_ONLY_KINDS`), çünkü kullanıcı yanlışlıkla yazma yetkili bir sunucuyu reviewer'a bağlamamalı.
- **Yetki `readOnly` bayrağıyla değil kimlik bilgisiyle kurulur.** Aynı backend'e iki giriş yazılır (`postgres-ro` read-only DB kullanıcısıyla + `postgres-rw`). Gerekçe: araç seviyesinde kısıtlama dört CLI'da eşit değil — yalnızca claude `--allowedTools mcp__srv__tool` ile araç bazında kesebiliyor, gemini yalnızca sunucu adı seviyesinde. Taşınabilir tek yaptırım birimi **sunucu girişidir**.
- **Model kümeyi yalnızca DARALTIR.** `assignment.mcp` bir istek listesidir; katalogda olmayan ad yeni sunucu açmaz, agent/kind kısıtını aşamaz. (Skillerde autoMatch listeyi *genişletebilir*; MCP'de yön terstir çünkü orada bedel token, burada **verilmiş yetki**.)
- **Sağlık testi MCP açmaz.** `agentEnvironment(agent, mcpBlock)` ikinci argümanı yalnızca motor verir; `testInstalledCli` vermez. Aksi halde her probe MCP sunucularını ayağa kaldırır ve `abortActiveProbes` onları öldürürken yarım proses bırakırdı.
- Geçersiz sunucu girişi **sessizce düşürülür** (normalize), çünkü yarım yapılandırılmış bir sunucuyu ajana vermek onu hiç vermemekten tehlikelidir. API katmanı ise ham gövdede **400** döner, böylece kullanıcı hatası sessizce yutulmaz.
- Yer tutucular `{cwd}` `{callId}` `{taskId}` `{tmp}` args/env içinde çözülür: eşzamanlı görevlerde aynı sunucunun iki örneği durum dizinini (örn. Playwright `--user-data-dir`) paylaşıp profil kilidi çakışmasın.
- `maxServersPerAssignment` varsayılan **2** (skillerdeki 3'ten muhafazakâr): ağır MCP'lerin araç tanımları tek başına 30k+ token yiyebilir.

## Adapter durumu

| CLI | Yol | Durum |
| --- | --- | --- |
| **claude** | `--mcp-config` + `--allowedTools` + `--strict-mcp-config` | ✅ `usable:true` — gerçek CLI ile uçtan uca doğrulandı |
| **opencode** | `OPENCODE_CONFIG_CONTENT` içindeki `mcp` bloğu | ✅ `usable:true` |
| codex | `configFile` yazıcı: `-p crewctl-<callId>` + `$CODEX_HOME/…toml` | ⚠️ `usable:false` — yazıcı hazır ama codex headless `exec` MCP tool çağrısını "user cancelled" ile iptal ediyor (codex sınırı) |
| gemini | `filterOnly` yazıcı: `--allowed-mcp-server-names` | ⚠️ `usable:false` — görev-başı enjeksiyon yok; sunucular `gemini mcp add` ile önceden kaydedilmeli |

**`usable` bayrağı — kanıtlanmış gerçek kapısı.** Bir stil *yazılabilir* olsa da CLI'nin runtime'ı aracı gerçekten *çağırmıyor* olabilir. Ölçüldü (2026-07-26): codex headless `exec` MCP tool çağrısını iptal ediyor (beş yapılandırma denendi: `approval_policy` never/on-failure, `trust_level`, `-c` noktalı-yol — hiçbiri exec'te otomatik onaylatmadı); gemini görev-başı enjeksiyon sunmuyor ve bu makinede auth da yok. `usable:false` olan adapter için: (a) `plan()` enjekte etmez, açık `note` döner; (b) `catalogForAgent` o agent'a MCP aracı **göstermez** → operatör MCP işini yalnızca kullanabilen CLI'lara (claude/opencode) yönlendirir. Bu, "operatör firecrawl işini codex-planner'a yönlendirdi ve codex kullanamadı" sorununun **kök çözümüdür**.

Yazıcılar (`codexToml`, `filterOnly`) doğru ve birim testlidir; codex/gemini runtime sınırı kalkarsa (veya kullanıcı gemini sunucusunu önceden kaydederse) `usable:true` ile anında devreye girer. Desteklenmeyen adapter sessizce atlanmaz: `plan()` bir `note` döner ve motor bunu yayınlar.

## Operator awareness

`agentCatalog` her agent için `tools` alanı üretir (`mcp.catalogForAgent`). Bu **farkındalıktır, erişim değil**: operatör "bu görev tarayıcıda doğrulama istiyor → tarayıcısı olan agent'a ver" diyebilsin. Operatörün kendisi MCP kullanmaz.

## UI

Ayarlar → **MCP Araçları** sekmesi form tabanlıdır (ham JSON değil): sunucu kartları, ekle/sil, hazır şablonlar (Playwright · dosya sistemi · fetch · CrewCtl) ve "fiilen verilecek türler" önizlemesi. Ayrıntı: `settings.md`.

## Security note

MCP sunucusu **ağ erişimli keyfi bir yerel prosestir** ve `sandbox.mode: "workspace"` garantisini **kapsamaz** (`permissions.deny` onu sınırlamaz). Bu yüzden `enabled: false` varsayılan, sunucu tanımı yalnızca kullanıcı elinden geçer ve Ayarlar'da açık uyarı vardır. Ayrıca ajan model çıktısıyla yeni sunucu **tanımlayamaz**, yalnızca kataloğa ad referansı verebilir.

## Known limitations

- Faz 2 bekleyen: codex TOML profili, gemini filtresi.
- **Katman 2 (skill frontmatter `mcp:`) henüz yok.** OpenHands deseni: skill kendi MCP sunucusunu ilan eder ve sunucu yalnızca skill aktive olunca başlar. `skill-registry.js` makinesi (frontmatter parse, scoring, delegasyon-başı çözümleme) bunu destekleyecek durumda. Claude Code'da aynı özellik istendi (issue #41068) ve *"closed as not planned"*, yani orkestratör katmanında yapmak gerçek bir boşluk dolduruyor.
- MCP durumu delegasyonlar arası **taşınmaz** (her proses kendi sunucu örneğini açar, oturum sürdürme yok). Planner'ın MCP ile öğrendiği somut gerçekleri plan metnine yazması gerekir — rol sözleşmesine bu kural henüz eklenmedi.
- Araç seviyesinde allowlist (`--allowedTools mcp__srv__tool`) claude'da mümkün ama henüz kullanılmıyor; yetki şu an sunucu girişi + kimlik bilgisi seviyesinde.

## Verification

- `cd orchestrator && node test/mcp.test.js` (birim güvenlik kuralları + sahte CLI ile uçtan uca enjeksiyon)
- `cd orchestrator && node test/server-flow.test.js` (config sözleşmesi)
- `npm test`

## Major Changes

### 2026-07-26 — codex/gemini yazıcıları + `usable` gerçek kapısı

- **Change:** codex `configFile` (per-callId TOML profili + `-p`, `trust_level`, cleanup) ve gemini `filterOnly` (`--allowed-mcp-server-names`) yazıcıları eklendi. Ama gerçek CLI ölçümü: codex headless `exec` MCP tool çağrısını iptal ediyor, gemini görev-başı enjeksiyon sunmuyor. Bu yüzden `usable` bayrağı eklendi (ikisi `usable:false`) ve `catalogForAgent` adapter-farkında oldu.
- **Reason:** Yazıcı doğru ama runtime yürütmüyorsa "çalışıyor" demek yanlış olur; asıl kullanıcı acısı operatörün MCP işini kullanamayan CLI'ya yönlendirmesiydi.
- **Impact:** claude/opencode tam çalışır ve operatöre araç gösterir; codex/gemini enjekte etmez, açık not verir, operatöre araç göstermez → yanlış yönlendirme biter. Motorun `runCli` dosya yazımı `absPath`/`token` iki biçimi destekleyecek şekilde genelleştirildi; `configFile` dosyaları koşum sonunda temizlenir.
- **Compatibility:** claude/opencode davranışı değişmedi. `agentEnvironment` imzası korunur. On üç mevcut suite değişmeden geçti.
- **Verification:** gerçek codex ile echo-MCP: sunucu yüklendi (araç göründü) ama çağrı "user cancelled" ile iptal edildi (5 yapılandırma); `npm test` 14 suite.
- **Files:** `orchestrator/src/mcp.js`, `orchestrator/src/cli-registry.js`, `orchestrator/src/engine.js`, `orchestrator/test/mcp.test.js`

### 2026-07-25 — İçe dönük MCP Faz 1 (claude + opencode, rol kapısıyla)

- **Change:** Yeni `src/mcp.js` (saf planlayıcı: normalize, sert kapı, adapter materyalizasyon planı), `engine.runCli`'de sandbox ile aynı noktada materyalizasyon, `agentEnvironment(agent, mcpBlock)`, `agentCatalog`'a `tools` farkındalığı, delegasyona `kind`/`mcp` geçirilmesi, `config.mcp` şeması, `/api/config` doğrulaması, Ayarlar → **MCP Araçları** sekmesi (form tabanlı; bkz. `settings.md`) ve `test/mcp.test.js`.
- **Reason:** Ajanların dış dünyaya (tarayıcı, DB, doküman) erişimi yoktu; reviewer'ın `NOT RUN` kaçış kapısı ve planner'ın "gerçek kod tabanıyla çalış" talimatı kanıta çevrilemiyordu.
- **Impact:** `implement` tam, `plan`/`review`/`research` salt okunur erişim alır; operatör hiçbir koşulda almaz. Sağlık testleri etkilenmez.
- **Compatibility:** `enabled: false` varsayılan → davranış birebir korunur. `agentEnvironment`'ın ikinci argümanı opsiyonel, mevcut çağrılar değişmedi. On iki mevcut suite değişmeden geçti.
- **Verification:** `npm test` (13 suite); uçtan uca test operatör çağrısında `--mcp-config` **bulunmadığını**, uzman çağrısında bulunduğunu ve yer tutucuların çözüldüğünü doğrular.
- **Files:** `orchestrator/src/mcp.js`, `orchestrator/src/engine.js`, `orchestrator/src/cli-registry.js`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/config.default.json`, `orchestrator/web/index.html`, `orchestrator/test/mcp.test.js`, `orchestrator/test/server-flow.test.js`, `orchestrator/test/ui-smoke.test.js`, `package.json`
