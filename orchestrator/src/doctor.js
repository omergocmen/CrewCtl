// doctor.js — ortam teşhisi: Node sürümü, kurulu CLI'lar, gerçek sağlık durumu ve
// yapılandırma özeti. Varsayılan davranış salt okunurdur; --fix açıkça istenirse
// otomatik keşif sonuçlarını config'e uygular.
const store = require("./store");
const cliRegistry = require("./cli-registry");

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", DIM = "\x1b[90m", B = "\x1b[1m", X = "\x1b[0m";
const ok = (s) => `${G}✓${X} ${s}`;
const no = (s) => `${R}✗${X} ${s}`;
const warn = (s) => `${Y}⚠${X} ${s}`;

function nodeOk() {
  const major = Number(process.versions.node.split(".")[0]);
  return { major, ok: major >= 18 };
}

function recommendedAction(cli, platform) {
  if (!cli.installed) return cli.install && (cli.install[platform] || cli.install.linux) || "Kurulum komutu bulunamadi.";
  if (cli.id === "opencode" && cli.ready === false) return cli.readinessError || "Ayarlar'dan erisilebilir bir OpenCode modeli secin.";
  const status = String(cli.health?.status || "").toLowerCase();
  if (status === "auth-required") return cli.health?.detail || "CLI ile oturum acin veya gerekli API anahtarini tanimlayin.";
  if (status === "quota") return cli.health?.detail || "Kota/bakiye durumunu kontrol edin veya farkli bir CLI secin.";
  if (status === "version-incompatible") return cli.health?.detail || "CLI surumunu guncelleyin veya desteklenen bir model secin.";
  if (status === "timeout") return cli.health?.detail || "CLI yavas yanit verdi; ag/model durumunu kontrol edip tekrar deneyin.";
  if (status === "failed") return cli.health?.detail || "CLI cikti/hata metnini kontrol edin.";
  return "";
}

function buildDoctorReport({ node, cfg, discovered, platform }) {
  const operator = cfg.operator?.cli || null;
  const cliReports = discovered.map((cli) => {
    const runnable = cliRegistry.cliCanRun(cli, cfg);
    const health = cli.health || { status: cli.installed ? "unknown" : "not-installed", label: cli.installed ? "Bilinmiyor" : "Kurulu degil", detail: cli.error || "" };
    return {
      id: cli.id,
      installed: Boolean(cli.installed),
      version: cli.version || "",
      runnable,
      ready: cli.id === "opencode" ? cli.ready !== false || Boolean(cfg.cliSettings?.opencode?.model) : true,
      health,
      recommendedAction: recommendedAction({ ...cli, health }, platform),
      operatorSelected: operator === cli.id,
      models: Array.isArray(cli.models) ? cli.models.slice() : [],
      recommendedModel: cli.recommendedModel || "",
    };
  });
  const runnable = cliReports.filter((cli) => cli.runnable);
  const enabledAgents = Object.entries(cfg.agents || {}).filter(([, agent]) => agent.enabled !== false);
  return {
    checkedAt: new Date().toISOString(),
    node,
    summary: {
      runnableCliCount: runnable.length,
      installedCliCount: cliReports.filter((cli) => cli.installed).length,
      enabledAgentCount: enabledAgents.length,
      operator,
      operatorRunnable: Boolean(cliReports.find((cli) => cli.id === operator)?.runnable),
    },
    clis: cliReports,
    config: {
      operator,
      enabledAgents: enabledAgents.map(([name, agent]) => ({
        name,
        adapter: agent.adapter || cliRegistry.adapterId(agent.cmd),
        roleFile: agent.roleFile || "",
      })),
    },
  };
}

function doctorExitCode(report) {
  if (!report.node.ok) return 1;
  if (!report.summary.runnableCliCount) return 1;
  if (report.summary.operator && !report.summary.operatorRunnable) return 1;
  return 0;
}

function printDoctorReport(report) {
  console.log(`\n${B}CrewCtl — Ortam Teşhisi${X}\n`);
  console.log(report.node.ok
    ? ok(`Node.js ${process.versions.node} (>=18 gerekli)`)
    : no(`Node.js ${process.versions.node} — 18+ gerekli!`));

  console.log(`\n${B}CLI araçları${X}`);
  for (const cli of report.clis) {
    const line = cli.installed
      ? `${cli.id}${DIM} — ${cli.version || "surum bilinmiyor"}${X}`
      : `${cli.id}${DIM} — kurulu değil${X}`;
    if (!cli.installed) {
      console.log("  " + no(line));
      if (cli.recommendedAction) console.log(`      ${DIM}${cli.recommendedAction}${X}`);
      continue;
    }
    if (cli.runnable) {
      const label = cli.health?.label && !["Hazır", "Bilinmiyor", "Test ediliyor"].includes(cli.health.label)
        ? ` · ${cli.health.label}` : "";
      console.log("  " + ok(`${line}${label}`));
    } else {
      console.log("  " + warn(`${line} · ${cli.health?.label || "hazir degil"}`));
      if (cli.recommendedAction) console.log(`      ${DIM}${cli.recommendedAction}${X}`);
    }
    if (cli.id === "opencode" && cli.recommendedModel) {
      console.log(`      ${DIM}onerilen model: ${cli.recommendedModel}${X}`);
    }
  }

  console.log(`\n${B}Yapılandırma${X}`);
  console.log(`  Operatör CLI: ${report.config.operator || "(yok)"}`);
  console.log(`  Uzman ajan sayısı: ${report.summary.enabledAgentCount}`);
  for (const agent of report.config.enabledAgents) {
    console.log(`    ${DIM}• ${agent.name} (${agent.adapter || "custom"}) — ${String(agent.roleFile || "").split("/").pop()}${X}`);
  }

  console.log("");
  if (!report.node.ok) console.log(no("Node sürümünü 18+ yapın."));
  else if (!report.summary.runnableCliCount) console.log(no("Görev çalıştırabilecek hazır bir CLI yok. Yukarıdaki önerilen aksiyonları uygulayın."));
  else if (report.config.operator && !report.summary.operatorRunnable) console.log(warn("Seçili operatör hazır değil. Hazır bir CLI seçin veya `crewctl doctor --fix` çalıştırın."));
  else console.log(ok("Hazır. npm start ile paneli açın."));
  console.log("");
}

async function main(options = {}) {
  store.ensureDirs();
  const node = nodeOk();
  const cfg = store.loadConfig();
  const platform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
  let discovered = cliRegistry.discoverInstalled();
  if (!options.quick) discovered = await cliRegistry.healthCheckAll(discovered, { timeoutMs: 45000, cfg });

  let changed = false;
  if (options.fix) {
    changed = Boolean(cliRegistry.addMissingAgents(cfg, discovered) | cliRegistry.ensureValidOperator(cfg, discovered));
    if (changed) store.saveConfig(cfg);
  }

  const report = buildDoctorReport({ node, cfg, discovered, platform });
  if (options.asJson) console.log(JSON.stringify({ ...report, fixed: changed }, null, 2));
  else {
    printDoctorReport(report);
    if (options.fix) console.log(changed ? ok("Yapilandirma guncellendi.") : `${DIM}Yapilandirma degisikligi gerekmedi.${X}`);
  }
  process.exitCode = doctorExitCode(report);
  return report;
}

if (require.main === module) {
  main({
    fix: process.argv.includes("--fix"),
    asJson: process.argv.includes("--json"),
    quick: process.argv.includes("--quick"),
  }).catch((error) => { console.error(`Hata: ${error.message}`); process.exitCode = 1; });
}

module.exports = { main, nodeOk, buildDoctorReport, doctorExitCode, recommendedAction };
