// doctor.js — ortam teşhisi: Node sürümü, kurulu CLI'lar ve yapılandırma özeti.
// Kullanım:  npm run doctor
const store = require("./store");
const cliRegistry = require("./cli-registry");

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", DIM = "\x1b[90m", B = "\x1b[1m", X = "\x1b[0m";
const ok = (s) => `${G}✓${X} ${s}`;
const no = (s) => `${R}✗${X} ${s}`;

function nodeOk() {
  const major = Number(process.versions.node.split(".")[0]);
  return { major, ok: major >= 18 };
}

function main(options = {}) {
  store.ensureDirs();
  const n = nodeOk();
  console.log(`\n${B}CrewCtl — Ortam Teşhisi${X}\n`);
  console.log(n.ok ? ok(`Node.js ${process.versions.node} (>=18 gerekli)`) : no(`Node.js ${process.versions.node} — 18+ gerekli!`));

  const clis = cliRegistry.discoverInstalled();
  const installed = clis.filter((c) => c.installed);
  console.log(`\n${B}CLI araçları${X}`);
  const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
  for (const c of clis) {
    if (c.installed) console.log("  " + ok(`${c.id}${DIM} — ${c.version}${X}`));
    else {
      const hint = c.install && (c.install[platform] || c.install.linux);
      console.log("  " + no(`${c.id}${DIM} — kurulu değil${X}`) + (hint ? `\n      ${DIM}kurulum: ${hint}${X}` : ""));
    }
  }

  const cfg = store.loadConfig();
  // Varsayilan teshis salt okunurdur. Farkli bir PATH ile calisan doctor komutu
  // kullanicinin mevcut agent'larini sessizce devre disi birakmamalidir.
  let changed = false;
  if (options.fix) {
    changed = Boolean(cliRegistry.addMissingAgents(cfg, clis) | cliRegistry.ensureValidOperator(cfg, clis));
    if (changed) store.saveConfig(cfg);
  }
  const agents = Object.entries(cfg.agents).filter(([, a]) => a.enabled !== false);
  console.log(`\n${B}Yapılandırma${X}`);
  console.log(`  Operatör CLI: ${cfg.operator?.cli || "(yok)"}`);
  console.log(`  Uzman ajan sayısı: ${agents.length}`);
  for (const [name, a] of agents) console.log(`    ${DIM}• ${name} (${a.adapter || a.cmd}) — ${(a.roleFile || "").split("/").pop()}${X}`);

  console.log("");
  if (!n.ok) { console.log(no("Node sürümünü 18+ yapın.")); process.exitCode = 1; }
  else if (!installed.length) {
    console.log(`${Y}⚠ Hiçbir CLI kurulu değil.${X} En az birini kurun (yukarıdaki komutlar), sonra tekrar deneyin.`);
    process.exitCode = 1;
  } else if (!cfg.operator?.cli) {
    console.log(`${Y}⚠ Operatör CLI seçilemedi.${X}`);
    process.exitCode = 1;
  } else {
    console.log(ok(`Hazır. ${B}npm start${X} ile paneli açın.`));
  }
  if (options.fix) console.log(changed ? ok("Yapilandirma guncellendi.") : `${DIM}Yapilandirma degisikligi gerekmedi.${X}`);
  console.log("");
}

if (require.main === module) main({ fix: process.argv.includes("--fix") });

module.exports = { main, nodeOk };
