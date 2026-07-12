const fs = require("fs");

const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
if (args[0] !== "run" || fileIndex < 0 || !args[fileIndex + 1]) {
  console.error("opencode adapter arguments invalid: " + JSON.stringify(args));
  process.exit(2);
}
const prompt = fs.readFileSync(args[fileIndex + 1], "utf8");
if (!prompt.includes("## Delegasyon")) {
  console.error("attached prompt was not delivered");
  process.exit(3);
}
fs.writeFileSync("opencode-output.txt", "opencode adapter ok\n");
process.stdout.write("YAPILANLAR: opencode-output.txt olusturuldu.\nDOĞRULAMA: dosya mevcut.");
