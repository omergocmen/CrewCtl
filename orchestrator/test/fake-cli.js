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
    if (operatorTask.includes("Inceleme valisi")) {
      process.stdout.write(JSON.stringify({
        summary: "Uygulama ve denetim tamamlanir; bir altyapi hatasi hizli yolu kapatir.",
        completionCriteria: ["team-output.txt olusmali", "bagimsiz inceleme PASS vermeli"],
        assignments: [
          { id: "governor-build", agent: "worker", kind: "implement", instruction: "team-output.txt olustur.", dependsOn: [] },
          { id: "governor-review", agent: "reviewer", kind: "review", instruction: "Teslimati incele ve karar ver.", dependsOn: ["governor-build"] },
          { id: "governor-broken", agent: "flaky", kind: "implement", instruction: "Yardimci kontrolu calistir.", dependsOn: [] },
        ],
      }));
      return;
    }
    if (operatorTask.includes("Inceleme dongusu")) {
      process.stdout.write(JSON.stringify({
        summary: "Bir uzman uygular, bagimsiz denetci dogrular.",
        completionCriteria: ["team-output.txt olusmali", "bagimsiz inceleme PASS vermeli"],
        assignments: [
          { id: "loop-build", agent: "worker", kind: "implement", instruction: "team-output.txt olustur.", dependsOn: [] },
          { id: "loop-review", agent: "reviewer", kind: "review", instruction: "Teslimati incele ve karar ver.", dependsOn: ["loop-build"] },
        ],
      }));
      return;
    }
    if (operatorTask.includes("Kismi teslimat")) {
      process.stdout.write(JSON.stringify({
        summary: "Uzman uygular; operator hicbir turda tatmin olmaz.",
        completionCriteria: ["team-output.txt olusmali", "canli tarayici dogrulamasi"],
        assignments: [{ id: "partial-build", agent: "worker", kind: "implement", instruction: "team-output.txt olustur.", dependsOn: [] }],
      }));
      return;
    }
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
    if (operatorTask.includes("Inceleme valisi")) {
      process.stdout.write(JSON.stringify({ status: "continue", reason: "Bir kez daha bagimsiz dogrulama istiyorum.", assignments: [{ id: "governor-review", agent: "reviewer", kind: "review", instruction: "Teslimati tekrar incele.", dependsOn: [] }] }));
      return;
    }
    if (operatorTask.includes("Inceleme dongusu")) {
      // PASS'e ragmen ayni kimlikle yeni bir inceleme turu ister: motor kimligi yeniden
      // adlandirmali ve inceleme valisi gorevi tamamlamalidir.
      process.stdout.write(JSON.stringify({ status: "continue", reason: "Bir kez daha bagimsiz dogrulama istiyorum.", assignments: [{ id: "loop-review", agent: "reviewer", kind: "review", instruction: "Teslimati tekrar incele.", dependsOn: [] }] }));
      return;
    }
    if (operatorTask.includes("Kismi teslimat")) {
      process.stdout.write(JSON.stringify({ status: "continue", reason: "Canli tarayici dogrulamasi hala eksik.", assignments: [{ id: `partial-again-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, agent: "worker", kind: "implement", instruction: "team-output.txt icerigini dogrula ve guncelle.", dependsOn: [] }] }));
      return;
    }
    process.stdout.write(JSON.stringify({ status: "complete", final: "Takim gorevi tamamlandi ve team-output.txt olusturuldu." }));
    return;
  }
  const delegationId = (prompt.match(/## Delegasyon\nID: ([^\n]+)/) || [])[1] || "";
  if (delegationId.startsWith("balanced-plan")) {
    process.stdout.write("PLAN ÖZETİ: Mevcut dosyaları koruyarak hedefi uygula ve ardından bağımsız inceleme çalıştır.\nADIMLAR:\n1. İlgili dosyayı oluştur veya güncelle.\n2. Çıktıyı doğrula.\nRİSKLER: Yok.");
    return;
  }
  if (delegationId.startsWith("balanced-review")) {
    const pass = !prompt.includes("Kismi teslimat");
    process.stdout.write(`DEĞERLENDİRME: ${pass ? "Teslimat kabul kriterlerini karşılıyor." : "Canlı doğrulama kriteri açık kaldı."}\nBULGULAR:\n- ${pass ? "Yok" : "Doğrulama eksik"}\nDOĞRULAMA:\n- team-output.txt kontrolü — ${pass ? "PASS" : "FAIL"}\nKALAN RİSK: ${pass ? "Yok" : "Canlı kontrol eksik"}\nVERDICT: ${pass ? "PASS" : "FAIL"}`);
    return;
  }
  if (delegationId === "governor-broken") {
    process.stderr.write("API key not valid: kontrollu test hatasi\n");
    process.exitCode = 2;
    return;
  }
  if (delegationId.startsWith("loop-review") || delegationId.startsWith("governor-review")) {
    process.stdout.write("DEĞERLENDİRME: Teslimat kabul kriterlerini karşılıyor.\nBULGULAR:\n- Yok\nDOĞRULAMA:\n- team-output.txt kontrolu — PASS (dosya mevcut)\nKALAN RİSK: Yok\nVERDICT: PASS");
    return;
  }
  fs.writeFileSync("team-output.txt", "agent teamwork ok\n");
  process.stderr.write("worker: dosya yaziliyor\n");
  process.stdout.write("YAPILANLAR: team-output.txt olusturuldu.\nDOĞRULAMA: dosya mevcut.");
});
