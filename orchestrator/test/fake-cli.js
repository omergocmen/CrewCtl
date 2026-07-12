const fs = require("fs");

let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { prompt += chunk; });
process.stdin.on("end", () => {
  const operatorTask = (prompt.match(/## Kullanici gorevi\n([\s\S]*?)\n## Calisma klasoru/) || [])[1] || "";
  if (prompt.includes("takip sohbeti")) {
    process.stdout.write("team-output.txt dosyasi olusturuldu; icerigi agent teamwork ok satiridir.");
    return;
  }
  if (prompt.includes("## Operator protokolu") && !prompt.includes("## Takim calisma kaydi")) {
    const failureTest = operatorTask.includes("Hata toleransi");
    const wrongRoleTest = operatorTask.includes("Yanlis rol");
    const openCodeTest = operatorTask.includes("OpenCode adapter");
    process.stdout.write(JSON.stringify({
      summary: "Bir uzman uygular, operator sonucu denetler.",
      completionCriteria: ["team-output.txt olusmali"],
      assignments: [{ id: failureTest ? "broken-attempt" : wrongRoleTest ? "auto-route" : openCodeTest ? "opencode-build" : "build-output", agent: failureTest ? "broken" : wrongRoleTest ? "planner" : openCodeTest ? "openworker" : "worker", kind: "implement", instruction: openCodeTest ? "opencode-output.txt dosyasini olustur." : "team-output.txt dosyasini olustur ve dogrula.", dependsOn: [] }],
    }));
    return;
  }
  if (prompt.includes("## Operator protokolu")) {
    if (operatorTask.includes("Hata toleransi") && !prompt.includes('"status": "completed"')) {
      process.stdout.write(JSON.stringify({ status: "continue", reason: "Ilk agent kullanilamadi; alternatif uzman deneniyor.", assignments: [{ id: "fallback-build", agent: "worker", instruction: "team-output.txt dosyasini olustur.", dependsOn: [] }] }));
      return;
    }
    process.stdout.write(JSON.stringify({ status: "complete", final: "Takim gorevi tamamlandi ve team-output.txt olusturuldu." }));
    return;
  }
  fs.writeFileSync("team-output.txt", "agent teamwork ok\n");
  process.stderr.write("worker: dosya yaziliyor\n");
  process.stdout.write("YAPILANLAR: team-output.txt olusturuldu.\nDOĞRULAMA: dosya mevcut.");
});
