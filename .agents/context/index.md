# Project Context Index

**Last verified:** 2026-07-18

Bu dizin, projenin güncel modül ve sayfa bağlamının kaynak haritasıdır. Bir alanı değiştirmeden önce ilgili context'i oku; değişiklikten sonra `.agents/skills/context-maintainer/SKILL.md` ile güncelle.

## Source map

| Source | Owning context |
| --- | --- |
| `README.md`, `orchestrator/package.json`, cross-module structure | `architecture.md` |
| `orchestrator/config.default.json`, config schema/migrations | `configuration.md` |
| `orchestrator/src/engine.js` | `engine.md` |
| `orchestrator/src/server.js` | `server-api.md` |
| `orchestrator/src/store.js` | `store.md` |
| `orchestrator/src/cli-registry.js` | `cli-registry.md` |
| `orchestrator/src/cli.js` | `cli.md` |
| `orchestrator/src/doctor.js` | `doctor.md` |
| `orchestrator/web/index.html` shell, live feed, engine controls | `dashboard.md` |
| `orchestrator/web/index.html` task composer, queue, approval, edit/history | `tasks.md` |
| `orchestrator/web/index.html` settings modal and configuration forms | `settings.md` |
| `orchestrator/web/index.html` folder browser modal, `/api/fs` | `filesystem-picker.md` |
| `orchestrator/web/index.html` completed-task chat | `operator-chat.md` |
| `orchestrator/web/flow.html` | `team-flow.md` |
| `orchestrator/web/code.html` | `live-code.md` |
| `orchestrator/web/board.html` | `board.md` |
| `orchestrator/src/schedule.js`, `orchestrator/web/index.html` zamanlama sekmesi, `/api/schedules` | `scheduling.md` |
| `orchestrator/roles/*.md` and role CRUD | `roles.md` |
| `orchestrator/test/**`, `orchestrator/package.json` test script | `tests.md` |

Bir dosya birden fazla kullanıcı akışı barındırabilir; bu durumda tüm ilgili context'leri güncelle. Yeni bir modül veya bağımsız sayfa/akış eklendiğinde yeni bir context dosyası oluştur ve bu tabloya ekle.
