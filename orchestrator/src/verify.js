// DOGRULAMA KAPISI. Teslimat kalitesini "LLM PASS dedi" kanaatinden cikarip CALISTIRILAN
// kanita baglar: kullanicinin tanimladigi komutlar (npm test, tsc --noEmit, lint...) calisma
// klasorunde gercekten kosulur ve cikti operatore geri beslenir.
//
// Bu modul KOMUT CALISTIRIR ama motor durumunu bilmez: saf yapilandirma normalizasyonu +
// yalitilmis proses kosumu. Motor entegrasyonu (hangi anda calisir, kirmizi kapida ne olur)
// engine.js'tedir; boylece kurallar tek yerde test edilebilir.
"use strict";

const { spawn } = require("child_process");

const isWin = process.platform === "win32";

const DEFAULTS = {
  enabled: true,
  commands: [],
  timeoutSeconds: 600,
  maxOutputChars: 4000,
  blockOnFailure: true,
  maxAttempts: 2,
};

// Saf ve idempotent: loadConfig sicak yoldur, bu fonksiyon yan etki uretmemeli.
function normalizeVerifyConfig(cfg) {
  const raw = cfg && typeof cfg === "object" ? cfg.verify : null;
  const source = raw && typeof raw === "object" ? raw : {};
  const commands = Array.isArray(source.commands)
    ? source.commands.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const positive = (value, fallback, min) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= min ? num : fallback;
  };
  return {
    enabled: source.enabled !== false,
    commands,
    timeoutSeconds: positive(source.timeoutSeconds, DEFAULTS.timeoutSeconds, 5),
    maxOutputChars: positive(source.maxOutputChars, DEFAULTS.maxOutputChars, 200),
    blockOnFailure: source.blockOnFailure !== false,
    maxAttempts: Math.max(1, Math.floor(positive(source.maxAttempts, DEFAULTS.maxAttempts, 1))),
  };
}

// Kapi etkin mi? Komut yoksa motor hicbir sey calistirmaz ve davranis eski surumle birebir ayni
// kalir. Varsayilan yapilandirmada commands bostur; kapi opt-in'dir.
function isActive(cfg) {
  const settings = normalizeVerifyConfig(cfg);
  return settings.enabled && settings.commands.length > 0;
}

// Test ciktisinda hem ilk hata detayi hem sondaki ozet onemlidir; ortadan kirp.
function clipMiddle(text, limit) {
  const value = String(text || "");
  if (value.length <= limit) return value;
  const head = Math.ceil(limit * 0.6);
  const tail = Math.max(0, limit - head);
  return `${value.slice(0, head)}\n...[${value.length - limit} karakter kirpildi]...\n${value.slice(value.length - tail)}`;
}

// Tek komut kosumu. Kullanici serbest metin komut yazar (or. "npm test"), bu yuzden shell
// gerekir; Node Windows'ta ComSpec, POSIX'te /bin/sh kullanir.
function runCommand(command, options = {}) {
  const cwd = options.cwd;
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULTS.timeoutSeconds * 1000);
  const maxOutputChars = Math.max(200, Number(options.maxOutputChars) || DEFAULTS.maxOutputChars);
  const started = Date.now();
  return new Promise((resolve) => {
    let child;
    let output = "";
    let settled = false;
    let timedOut = false;
    const finish = (extra) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        durationMs: Date.now() - started,
        output: clipMiddle(output, maxOutputChars),
        timedOut,
        ...extra,
      });
    };
    try {
      child = spawn(command, {
        cwd,
        shell: true,
        windowsHide: true,
        env: {
          ...process.env,
          // Cogu test kosucusu TTY gordugunde watch/interaktif moda girer ve kapi sonsuza kadar
          // asili kalirdi. CI=1 standart kacis yolu; FORCE_COLOR=0 ciktiyi ANSI kodlarindan
          // arindirip operatore temiz metin gonderir.
          CI: "1",
          FORCE_COLOR: "0",
          NO_COLOR: "1",
        },
      });
    } catch (error) {
      return finish({ ok: false, exitCode: null, error: error.message });
    }
    const timer = setTimeout(() => {
      timedOut = true;
      if (isWin && child.pid) {
        try { spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" }); } catch {}
      } else {
        try { child.kill("SIGKILL"); } catch {}
      }
    }, timeoutMs);
    const collect = (chunk) => {
      output += chunk;
      // Bellek koruma: cok konuskan komutlar (webpack, jest --verbose) yuz MB uretebilir.
      if (output.length > maxOutputChars * 8) output = output.slice(-maxOutputChars * 8);
    };
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    child.on("error", (error) => finish({ ok: false, exitCode: null, error: error.message }));
    child.on("close", (code) => {
      if (timedOut) return finish({ ok: false, exitCode: code, error: `Komut ${Math.round(timeoutMs / 1000)} sn icinde bitmedi ve sonlandirildi.` });
      finish({ ok: Number(code) === 0, exitCode: code });
    });
  });
}

// Komutlari sirayla kosar ve ILK basarisizlikta durur: kapi bir rapor araci degil, bir kapidir;
// kirmizi ciktiginda kalan komutlari kosmak yalnizca duvar saati harcar.
async function runVerification(commands, options = {}) {
  const list = (Array.isArray(commands) ? commands : []).map((value) => String(value || "").trim()).filter(Boolean);
  const started = Date.now();
  const results = [];
  for (const command of list) {
    const result = await runCommand(command, options);
    results.push(result);
    if (!result.ok) break;
    if (typeof options.shouldStop === "function" && options.shouldStop()) break;
  }
  const failed = results.find((result) => !result.ok) || null;
  return {
    ok: !failed,
    ran: results.length,
    total: list.length,
    results,
    failed,
    durationMs: Date.now() - started,
  };
}

// delivery.verification alanina yazilacak tek satirlik ozet.
function summarize(report) {
  if (!report || report.skipped) return "";
  if (!Array.isArray(report.results) || !report.results.length) return "";
  const seconds = (report.durationMs / 1000).toFixed(1);
  if (report.ok) return `Dogrulama kapisi GECTI (${report.results.map((r) => r.command).join(" · ")}) · ${seconds}s`;
  const failed = report.failed;
  return `Dogrulama kapisi BASARISIZ: \`${failed?.command || "?"}\`${failed?.timedOut ? " (zaman asimi)" : ` (cikis kodu ${failed?.exitCode})`} · ${seconds}s`;
}

// Operatorun sonraki turda gorecegi rapor. Basarisiz komutun ciktisi kanittir; operator bunu
// okuyup duzeltme delegasyonu acar.
function reportForPrompt(report, maxOutputChars = DEFAULTS.maxOutputChars) {
  if (!report || report.skipped || !Array.isArray(report.results) || !report.results.length) return "";
  const lines = report.results.map((result) => {
    const state = result.ok ? "GECTI" : result.timedOut ? "ZAMAN ASIMI" : `BASARISIZ (cikis kodu ${result.exitCode})`;
    return `- \`${result.command}\` → ${state} · ${(result.durationMs / 1000).toFixed(1)}s`;
  });
  if (report.ok) return `Tum dogrulama komutlari gecti.\n${lines.join("\n")}`;
  const failed = report.failed;
  return `DOGRULAMA BASARISIZ — teslimat bu haliyle kabul edilemez.\n${lines.join("\n")}\n\n` +
    `## Basarisiz komut ciktisi (\`${failed.command}\`)\n${clipMiddle(failed.output || failed.error || "(cikti yok)", maxOutputChars)}`;
}

module.exports = {
  DEFAULTS,
  normalizeVerifyConfig,
  isActive,
  runCommand,
  runVerification,
  summarize,
  reportForPrompt,
  clipMiddle,
};
