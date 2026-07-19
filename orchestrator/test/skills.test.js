const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
// Canli runtime'dan izole et: store/skill-registry'yi require etmeden ONCE kendi gecici ROOT'unu ayarla.
const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "cli-team-skills-"));
process.env.CLI_TEAM_ROOT = TEST_ROOT;
fs.mkdirSync(path.join(TEST_ROOT, "skills"), { recursive: true });

const skillRegistry = require("../src/skill-registry");
const engine = require("../src/engine");
const { normalizeAssignments } = engine._internals;

function main() {
  try {
    // ---- Paketle gelen katalog: en az 60 kısa, yerel rehber ----
    const bundledDir = path.join(__dirname, "..", "skills");
    const bundledFiles = fs.readdirSync(bundledDir).filter((file) => file.endsWith(".md"));
    assert.ok(bundledFiles.length >= 60, `en az 60 paket skill bekleniyor, bulunan: ${bundledFiles.length}`);
    for (const file of bundledFiles) {
      const bundledText = fs.readFileSync(path.join(bundledDir, file), "utf8");
      const bundled = skillRegistry.parseFrontmatter(bundledText);
      assert.match(String(bundled.meta.name || ""), /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${file}: gecerli name`);
      assert.ok(String(bundled.meta.description || "").length > 20, `${file}: kisa aciklama gerekli`);
      assert.ok(String(bundled.body || "").length > 80, `${file}: prosedur govdesi gerekli`);
      assert.deepEqual(skillRegistry.validateSkill(file, bundledText), { ok: true, errors: [] }, `${file}: sema gecerli olmali`);
    }
    assert.equal(skillRegistry.validateSkill("bad.md", "---\nname: Wrong Name\n---\n").ok, false);

    // ---- Frontmatter ayristirma ----
    const parsed = skillRegistry.parseFrontmatter("---\nname: alpha\nappliesTo: [x, y]\nmatch: a, b\n---\nGovde metni burada.");
    assert.equal(parsed.meta.name, "alpha");
    assert.deepEqual(parsed.meta.appliesTo, ["x", "y"]);
    assert.equal(parsed.body, "Govde metni burada.");
    const noFront = skillRegistry.parseFrontmatter("frontmatter yok");
    assert.deepEqual(noFront.meta, {});
    assert.equal(noFront.body, "frontmatter yok");

    // ---- Dosya yukleme ----
    skillRegistry.writeSkill("sample.md", "---\nname: sample\ndescription: ornek beceri\nappliesTo: [implement]\nmatch: [test]\n---\nBu becerinin govdesi.");
    const loaded = skillRegistry.loadSkill("sample");
    assert.equal(loaded.name, "sample");
    assert.equal(loaded.description, "ornek beceri");
    assert.deepEqual(loaded.appliesTo, ["implement"]);
    assert.equal(loaded.body, "Bu becerinin govdesi.");

    // ---- Katalog kullanici-kapili: yalnizca etkin olanlar gorunur ----
    assert.equal(skillRegistry.catalog({ skills: { enabled: ["sample"] } }).length, 1);
    assert.equal(skillRegistry.catalog({ skills: { enabled: [] } }).length, 0);
    assert.equal(skillRegistry.catalog({}).length, 0, "skills yapilandirmasi yoksa katalog bos olmali");

    // ---- Goreve gore kisa liste: katalog sayisi ve karakter maliyeti sabit kalir ----
    for (let i = 0; i < 30; i++) {
      skillRegistry.writeSkill(`extra-${i}.md`, `---\nname: extra-${i}\ndescription: ${i === 17 ? "SEO canonical tarama denetimi" : "Ilgisiz genel prosedur"}\nappliesTo: [review]\nmatch: [${i === 17 ? "canonical, seo" : `konu-${i}`}]\n---\n${"Uzun govde. ".repeat(100)}`);
    }
    const largeCfg = { skills: { enabled: ["*"], catalogLimit: 4, charBudget: 500, maxSkillsPerAssignment: 2 } };
    const shortlist = skillRegistry.catalog(largeCfg, "canonical SEO denetimi yap", "review");
    assert.ok(shortlist.length <= 4);
    assert.ok(JSON.stringify(shortlist).length <= 500);
    assert.equal(shortlist[0].name, "extra-17");
    assert.ok(!JSON.stringify(shortlist).includes("Uzun govde"), "skill govdesi operator kataloguna sizmamali");
    assert.equal(skillRegistry.catalogStats(largeCfg, "canonical SEO denetimi yap", "review").enabled, 31);
    const tinyCatalog = skillRegistry.catalog({ skills: { enabled: ["*"], catalogLimit: 50, charBudget: 200 } }, "canonical SEO", "review");
    assert.ok(JSON.stringify(tinyCatalog).length <= 200, "en kucuk katalog butcesi de kesin sinir olmali");

    // ---- Assignment cozumleme: etkin olmayan/tanimsiz beceri dusurulur ----
    const resolved = skillRegistry.resolveForAssignment(["sample", "disabled-one"], { skills: { enabled: ["sample"] } });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].name, "sample");
    assert.equal(skillRegistry.resolveForAssignment(["sample"], { skills: { enabled: [] } }).length, 0, "etkin degilse cozulmemeli");

    // ---- Motor entegrasyonu: normalizeAssignments beceriyi etkin kume ile filtreler ----
    const cfgEnabled = { operator: { maxDelegationsPerRound: 5 }, skills: { enabled: ["sample"] }, agents: { worker: { capabilities: ["implementation"] } } };
    const withSkill = normalizeAssignments(
      [{ id: "a", agent: "worker", kind: "implement", instruction: "uygula", dependsOn: [], skills: ["sample", "disabled-one"] }],
      cfgEnabled, "operator", new Set()
    );
    assert.deepEqual(withSkill[0].skills, ["sample"], "yalnizca etkin beceri kalmali");

    const cfgDisabled = { operator: { maxDelegationsPerRound: 5 }, skills: { enabled: [] }, agents: { worker: { capabilities: ["implementation"] } } };
    const noSkill = normalizeAssignments(
      [{ id: "a", agent: "worker", kind: "implement", instruction: "uygula", dependsOn: [], skills: ["sample"] }],
      cfgDisabled, "operator", new Set()
    );
    assert.deepEqual(noSkill[0].skills, [], "beceri etkin degilse iliştirilmemeli");

    const noField = normalizeAssignments(
      [{ id: "a", agent: "worker", kind: "implement", instruction: "uygula", dependsOn: [] }],
      cfgEnabled, "operator", new Set()
    );
    assert.deepEqual(noField[0].skills, [], "skills alani yoksa bos dizi olmali");

    const autoMatched = normalizeAssignments(
      [{ id: "a", agent: "worker", kind: "implement", instruction: "ilgili testi yaz", dependsOn: [] }],
      { ...cfgEnabled, skills: { enabled: ["sample"], autoMatch: true, maxSkillsPerAssignment: 2 } },
      "operator", new Set(), "Bu davranis icin test ekle"
    );
    assert.deepEqual(autoMatched[0].skills, ["sample"], "operator alani atlarsa gorev metninden eslesmeli");

    // Yeni davranis: operator kodlama/plan/review isinde skills:[] gonderse bile, kullanicinin
    // etkin becerilerinden goreve GERCEKTEN uyanlar otomatik eklenir (skiller guvenilir kullanilsin).
    const explicitNone = normalizeAssignments(
      [{ id: "a", agent: "worker", kind: "implement", instruction: "test yaz", dependsOn: [], skills: [] }],
      { ...cfgEnabled, skills: { enabled: ["sample"], autoMatch: true } },
      "operator", new Set(), "test"
    );
    assert.deepEqual(explicitNone[0].skills, ["sample"], "implement/plan/review'da acik bos secim ilgili beceriyle otomatik doldurulur");

    // Opt-out: autoMatch kapaliyken operatorun acik bos secimi korunur.
    const explicitNoneNoAuto = normalizeAssignments(
      [{ id: "a", agent: "worker", kind: "implement", instruction: "test yaz", dependsOn: [], skills: [] }],
      { ...cfgEnabled, skills: { enabled: ["sample"], autoMatch: false } },
      "operator", new Set(), "test"
    );
    assert.deepEqual(explicitNoneNoAuto[0].skills, [], "autoMatch kapaliyken acik bos secim korunur");

    const specialistPrompt = engine.specialistPrompt(
      { prompt: "Bir test ekle" },
      { ...cfgEnabled, skills: { enabled: ["sample"], referenceCharBudget: 500 }, agents: { worker: {} }, teamContextCharBudget: 1000 },
      { id: "a", agent: "worker", kind: "implement", instruction: "test yaz", skills: ["sample"] },
      { results: {} }
    );
    assert.ok(specialistPrompt.includes("Rehber:"), "uzman promptu rehber yolunu gostermeli");
    assert.ok(specialistPrompt.includes(path.join(TEST_ROOT, "skills", "sample.md")));
    assert.ok(!specialistPrompt.includes("Bu becerinin govdesi."), "tam skill govdesi uzman promptuna enjekte edilmemeli");
    assert.ok(skillRegistry.toPromptRefs(resolved, 300).length <= 300, "uzman referans butcesi kesin sinir olmali");

    // ---- Silme etkin listeye sizdirmaz (registry seviyesi) ----
    skillRegistry.deleteSkill("sample.md");
    assert.equal(skillRegistry.loadSkill("sample"), null);

    console.log("skills ok");
  } finally {
    try { fs.rmSync(TEST_ROOT, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }); } catch {}
  }
}

main();
