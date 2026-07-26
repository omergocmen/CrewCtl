// Es zamanlilik testi icin YAVAS sahte CLI. Amaci gecikme uretmek: iki gorev gercekten ust uste
// binmezse "es zamanli kostu" iddiasi olculemez. fake-cli.js gibi prompt evresine gore yanit
// verir ama her yaniti FAKE_DELAY_MS kadar geciktirir.
const fs = require("fs");

const DELAY = Number(process.env.FAKE_DELAY_MS || 1200);

let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { prompt += chunk; });
process.stdin.on("end", () => {
  const reply = () => {
    const operatorPhase = prompt.includes("## Operator protokolu");
    const reviewPhase = operatorPhase && prompt.includes("## Takim calisma kaydi");
    if (operatorPhase && !reviewPhase) {
      // Plan evresi: tek bir uygulama delegasyonu.
      process.stdout.write(JSON.stringify({
        summary: "Tek uzman dosyayi olusturur.",
        completionCriteria: ["team-output.txt olusmali"],
        assignments: [{ id: "slow-build", agent: "worker", kind: "implement", instruction: "team-output.txt olustur.", dependsOn: [] }],
      }));
      return;
    }
    if (reviewPhase) {
      process.stdout.write(JSON.stringify({ status: "complete", final: "Yavas gorev tamamlandi." }));
      return;
    }
    // Uzman evresi: calisma klasorune (worktree) yaz. Iki gorev AYNI dosya adini kullanir;
    // ayri agaclarda calistiklari icin catismamalari izolasyonun kanitidir.
    fs.writeFileSync("team-output.txt", `yavas ajan ${process.pid}\n`);
    process.stdout.write("YAPILANLAR: team-output.txt olusturuldu.\nDOĞRULAMA: dosya mevcut.");
  };
  setTimeout(reply, DELAY);
});
