#!/usr/bin/env node
// Windows'ta fake-opencode.cmd shim'i, POSIX'te dosyanin kendisi calistirilir (shebang + exec biti).
const fs = require("fs");

const args = process.argv.slice(2);
let inlineConfig = {};
try { inlineConfig = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT || "{}"); } catch {}
if (inlineConfig.permission?.["*"] !== "allow") {
  console.error("opencode autonomous permission config missing");
  process.exit(4);
}
const fileIndex = args.indexOf("--file");
if (args[0] !== "run" || fileIndex < 0 || !args[fileIndex + 1]) {
  console.error("opencode adapter arguments invalid: " + JSON.stringify(args));
  process.exit(2);
}

// Gercek OpenCode, stdin TTY degilse mesaji borudan da okur ve EOF bekler. Engine stdin'i
// kapatmazsa hicbir is yapmadan takilir. Ayni davranisi burada birebir taklit ediyoruz ki
// bu regresyon testlerden kacamasin: stdin'i kapatmayan cagri, cikti uretmeden asili kalir.
process.stdin.resume();
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  const prompt = fs.readFileSync(args[fileIndex + 1], "utf8");
  if (!prompt.includes("## Delegasyon")) {
    console.error("attached prompt was not delivered");
    process.exit(3);
  }
  fs.writeFileSync("opencode-output.txt", "opencode adapter ok\n");
  process.stdout.write(JSON.stringify({ type: "text", part: { type: "text", text: "YAPILANLAR: opencode-output.txt olusturuldu.\nDOGRULAMA: dosya mevcut." } }) + "\n");
});
