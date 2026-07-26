# Outbound MCP Server Context

**Sources:** `orchestrator/src/mcp-server.js`, `orchestrator/src/cli.js` (`mcp` komutu), `orchestrator/config.default.json`

**Last verified:** 2026-07-25

## Purpose

CrewCtl'i **başka bir kodlama ajanına araç olarak sunar** (dışa dönük MCP). Claude Code, Codex, Gemini veya OpenCode içinde çalışan bir ajan, kendi akışından CrewCtl kuyruğuna görev ekleyebilir ve durum okuyabilir. Rakiplerde karşılığı: Vibe Kanban'ın MCP sunucusu rolü ve Conductor OSS'in MCP ile görev dispatch'i.

Bu, **içe dönük MCP'nin tersidir**: burada CrewCtl sunucu, karşı ajan istemcidir. İçe dönük yön (ajanlara MCP aracı vermek) henüz uygulanmadı.

## Responsibilities

- stdio üzerinde satır-sonu ile ayrılmış JSON-RPC 2.0 taşıması (`start`, `splitFrames`).
- MCP yaşam döngüsü: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`; `resources/list`, `resources/templates/list`, `prompts/list` boş liste döndürür.
- Sürüm uzlaşması (`initializeResult`): istemcinin istediği sürüm destekleniyorsa aynısıyla, değilse kendi en yeni sürümüyle yanıt verir.
- Beş araç: `crewctl_add_task`, `crewctl_task_status`, `crewctl_list_tasks`, `crewctl_engine_status` ve (opt-in) `crewctl_engine_control`.

## Contracts and invariants

- **Süreç CrewCtl değil, çalışan panelin HTTP API istemcisidir.** Böylece store'a ikinci bir yazar eklenmez ve motor kontrolü gerçekten çalışan motoru etkiler. Panel kapalıysa araçlar `isError: true` ile net bir yönlendirme mesajı döndürür — protokol hatası değil.
- Adres çözümü: `CREWCTL_URL` > `http://${HOST||127.0.0.1}:${PORT||4317}`. Server ile aynı env adları kullanılır.
- **stdout yalnızca protokol mesajları içindir.** Her türlü teşhis stderr'e yazılır; `crewctl mcp` yolu başka hiçbir şey yazdırmamalıdır.
- Bildirimlere (id yok) yanıt YAZILMAZ; `handleMessage` bu durumda `null` döner.
- Araç yürütme hatası `isError: true` içerikle döner (model görüp düzeltebilsin); JSON-RPC `error` yalnızca bozuk protokol mesajları için kullanılır.
- **El sıkışma ZORUNLU DEĞİLDİR.** 2026-07-28 revizyonu `initialize`/`initialized` handshake'ini kaldırıp sürüm/istemci bilgisini her isteğin `_meta` alanına taşıdığı için `initialize` gelmeden gönderilen `tools/list` ve `tools/call` da yanıtlanır; `server/discover` eş anlamlı olarak sunulur. Böylece hem klasik hem stateless istemciler çalışır.
- Desteklenen sürümler: `2025-11-25` (en yeni), `2025-06-18`, `2025-03-26`, `2024-11-05`.
- **Motor kontrolü opt-in'dir:** `mcpServer.allowEngineControl !== true` iken `crewctl_engine_control` araç kataloğunda **hiç görünmez** ve çağrılırsa açıklayıcı `isError` döner. Gerekçe: harici bir ajanın otonom koşumu kendi başına başlatması kullanıcının açık tercihi olmalıdır.
- `crewctl_add_task` motor durmuşken görevin kuyrukta bekleyeceğini yanıtta açıkça söyler; aksi halde çağıran ajan işin başladığını sanır.
- Görev nesneleri `summarizeTask` ile özetlenir; ham `teamState` ve tam CLI çıktıları çağırana gönderilmez (bağlam şişmesini önler).

## Kullanım

Karşı ajanın MCP yapılandırmasına eklenir:

~~~json
{"mcpServers":{"crewctl":{"command":"npx","args":["-y","@omerrgocmen/crewctl","mcp"]}}}
~~~

Farklı port kullanılıyorsa aynı `PORT` (veya `CREWCTL_URL`) değeri MCP süreç ortamına da verilmelidir.

## Interactions

Panel API sözleşmesi için `server-api.md`; `mcp` komutu için `cli.md`; `mcpServer` şeması için `configuration.md`. Araçların döndürdüğü `delivery.verify` alanı için `verify.md`.

## Known limitations

- Yalnızca araç (tool) sunar; resource ve prompt yüzeyleri boştur.
- Kimlik doğrulama yoktur: güvenlik sınırı, panelin `127.0.0.1`'e bağlı olması ve MCP sürecinin kullanıcının kendi makinesinde çalışmasıdır.
- 2026-07-28 revizyonu final hâline geldiğinde `_meta` tabanlı sürüm taşıması ve `server/discover` yanıt şeması yeniden doğrulanmalıdır (bu sürüm spec RC'ye göre yazıldı).
- Ayarlar arayüzünde `mcpServer` alanı yoktur; `allowEngineControl` ham JSON'dan düzenlenir.

## Verification

- `cd orchestrator && node test/mcp-server.test.js`
- Canlı: `PORT=4519 OPEN=0 node src/server.js` çalışırken `PORT=4519 node src/cli.js mcp` sürecine JSON-RPC göndererek el sıkışma, `tools/list` ve gerçek görev oluşturmayı doğrula.

## Major Changes

### 2026-07-25 — Dışa dönük MCP sunucusu eklendi

- **Change:** Yeni `src/mcp-server.js` (sıfır bağımlılık, stdio JSON-RPC 2.0), `crewctl mcp` komutu, `config.mcpServer.allowEngineControl` şeması ve `test/mcp-server.test.js` (protokol/araç birimleri + gerçek süreci konuşturan uçtan uca senaryo) eklendi.
- **Reason:** CrewCtl yalnızca kendi panelinden kullanılabiliyordu; başka bir ajanın akışından iş devredilemiyordu. Rakiplerin (Vibe Kanban, Conductor OSS) sunduğu bu yön eksikti.
- **Impact:** Herhangi bir MCP istemcisi CrewCtl'e görev ekleyip ilerlemeyi okuyabilir. Motor kontrolü varsayılan olarak kapalıdır.
- **Compatibility:** Tamamen additive; panel, motor ve mevcut API sözleşmeleri değişmedi. MCP süreci ayrı çalışır ve panel kapalıyken yalnızca açıklayıcı hata döndürür.
- **Verification:** `npm test` (10 suite); canlı panele karşı el sıkışma, araç listesi, `engine_status`, gerçek `add_task`, `task_status`, `list_tasks` ve kapalı `engine_control` doğrulandı.
- **Files:** `orchestrator/src/mcp-server.js`, `orchestrator/src/cli.js`, `orchestrator/src/store.js`, `orchestrator/src/server.js`, `orchestrator/config.default.json`, `orchestrator/test/mcp-server.test.js`, `package.json`
