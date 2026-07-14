// skill-registry.js — yeniden kullanilabilir "beceri" (skill) dosyalarini yukler, ayristirir
// ve operatore/uzmana verilecek bicime cevirir. Beceriler roles/*.md gibi Markdown'dir; farki
// frontmatter tasimalari ve KULLANICI TARAFINDAN ETKINLESTIRILENLERIN operatore katalog olarak
// sunulmasidir. Sifir bagimlilik: frontmatter'i kendi minimal ayristiricimizla okuruz.
const fs = require("fs");
const path = require("path");
const store = require("./store");

const SKILLS_DIR = path.join(store.ROOT, "skills");

function ensureDir() {
  try { fs.mkdirSync(SKILLS_DIR, { recursive: true }); } catch {}
}

function toList(value) {
  if (Array.isArray(value)) return value.map(String).map((x) => x.trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(",").map((x) => x.trim()).filter(Boolean);
  return [];
}

// `--- ... ---` bloğundan basit `key: value` ciftlerini okur. Deger `[a, b]` veya virgullu
// liste ise diziye cevrilir. YAML'in tamamini desteklemeyiz; skill dosyalari icin bu yeterli.
function parseFrontmatter(text) {
  const raw = String(text || "");
  const match = raw.match(/^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw.trim() };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    let value = kv[2].trim();
    if (/^\[.*\]$/.test(value)) {
      value = value.slice(1, -1).split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      value = value.replace(/^["']|["']$/g, "");
    }
    meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}

function fileNameFor(nameOrFile) {
  const base = path.basename(String(nameOrFile || ""));
  return base.toLowerCase().endsWith(".md") ? base : `${base}.md`;
}

function slugFor(file) {
  return path.basename(String(file)).replace(/\.md$/i, "");
}

function listSkillFiles() {
  ensureDir();
  try { return fs.readdirSync(SKILLS_DIR).filter((f) => f.toLowerCase().endsWith(".md")).sort(); }
  catch { return []; }
}

function loadSkill(nameOrFile) {
  const file = fileNameFor(nameOrFile);
  const p = path.join(SKILLS_DIR, file);
  if (!fs.existsSync(p)) {
    // Etkin liste dosya adi yerine frontmatter `name` slug'ini tutuyor olabilir.
    const byName = listSkillFiles().map((f) => ({ f, s: parseFrontmatter(readRaw(f)) }))
      .find(({ f, s }) => String(s.meta.name || slugFor(f)) === slugFor(nameOrFile));
    if (!byName) return null;
    return buildSkill(byName.f, byName.s);
  }
  return buildSkill(file, parseFrontmatter(fs.readFileSync(p, "utf8")));
}

function buildSkill(file, parsed) {
  const { meta, body } = parsed;
  return {
    name: String(meta.name || slugFor(file)),
    file,
    description: String(meta.description || ""),
    category: String(meta.category || "general"),
    appliesTo: toList(meta.appliesTo),
    match: toList(meta.match),
    body,
  };
}

function readRaw(nameOrFile) {
  const p = path.join(SKILLS_DIR, fileNameFor(nameOrFile));
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function allSkills() {
  return listSkillFiles().map((f) => buildSkill(f, parseFrontmatter(readRaw(f))));
}

function enabledNames(cfg) {
  const list = cfg && cfg.skills && Array.isArray(cfg.skills.enabled) ? cfg.skills.enabled.map(String) : [];
  return new Set(list);
}

function enabledSkills(cfg, installed = null) {
  const enabled = enabledNames(cfg);
  if (!enabled.size) return [];
  const wildcard = enabled.has("*");
  return (installed || allSkills()).filter((skill) => wildcard || enabled.has(skill.name));
}

function normalizeText(value) {
  return String(value || "").toLocaleLowerCase("tr-TR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreSkill(skill, context, kind = "") {
  const haystack = ` ${normalizeText(context)} `;
  if (!haystack.trim()) return 0;
  const stopwords = new Set(["icin", "ile", "veya", "olan", "olarak", "yap", "yaz", "ekle", "kur", "kullan", "tasarla", "incele", "duzelt", "olustur", "guncelle", "planla", "create", "build", "write", "add", "use", "design", "review", "fix", "update", "implement"]);
  const tokens = new Set(haystack.trim().split(/\s+/).filter((token) => token.length > 1 && !stopwords.has(token)));
  let lexical = 0;
  for (const rawPhrase of skill.match) {
    const phrase = normalizeText(rawPhrase);
    if (!phrase) continue;
    if (!phrase.includes(" ") && stopwords.has(phrase)) continue;
    if (haystack.includes(` ${phrase} `)) lexical += 18 + Math.min(8, phrase.split(" ").length * 2);
    else if (phrase.split(" ").every((token) => tokens.has(token))) lexical += 10;
  }
  const nameParts = normalizeText(skill.name).split("-").filter((token) => token.length > 2);
  lexical += nameParts.filter((token) => tokens.has(token)).length * 8;
  const descriptionTokens = new Set(normalizeText(skill.description).split(" ").filter((token) => token.length > 3));
  const descriptionHits = [...tokens].filter((token) => descriptionTokens.has(token));
  if (descriptionHits.length > 1) lexical += descriptionHits.length * 2;
  if (!lexical) return 0;
  const kindFit = !kind || !skill.appliesTo.length || skill.appliesTo.includes(kind) ? 6 : -8;
  return Math.max(1, lexical + kindFit);
}

function ranked(cfg, context = "", kind = "", installed = null) {
  return enabledSkills(cfg, installed).map((skill) => ({ skill, score: scoreSkill(skill, context, kind) }))
    .filter(({ score }) => !context || score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name, "en"));
}

function compact(skill) {
  const description = skill.description.length > 180 ? `${skill.description.slice(0, 177)}...` : skill.description;
  return { name: skill.name, description, appliesTo: skill.appliesTo };
}

// Operatore tum govdeleri veya tum aciklamalari yuklemek yerine, gorev metnine gore en ilgili
// etkin becerileri verir. Limit ve karakter butcesi katalog buyuse bile prompt maliyetini sabitler.
function catalogFromRanked(cfg, rankedSkills) {
  const limit = Math.max(1, Number(cfg?.skills?.catalogLimit) || 12);
  const budget = Math.max(200, Number(cfg?.skills?.charBudget) || 2400);
  const out = [];
  for (const { skill } of rankedSkills) {
    if (out.length >= limit) break;
    let item = compact(skill);
    let candidate = [...out, item];
    if (JSON.stringify(candidate).length > budget) {
      if (out.length) break;
      const withoutDescription = { ...item, description: "" };
      const fixedCost = JSON.stringify([withoutDescription]).length;
      if (fixedCost > budget) break;
      const room = Math.max(0, budget - fixedCost - 3);
      item = { ...item, description: room ? `${item.description.slice(0, room)}...` : "" };
      candidate = [item];
    }
    out.push(item);
  }
  return out;
}

function discover(cfg, context = "", kind = "") {
  const installed = allSkills();
  const enabled = enabledSkills(cfg, installed);
  const matches = ranked(cfg, context, kind, installed);
  return {
    catalog: catalogFromRanked(cfg, matches),
    stats: { installed: installed.length, enabled: enabled.length, matched: matches.length },
  };
}

function catalog(cfg, context = "", kind = "") {
  return discover(cfg, context, kind).catalog;
}

function catalogStats(cfg, context = "", kind = "") {
  return discover(cfg, context, kind).stats;
}

function suggest(cfg, context, kind = "") {
  const limit = Math.max(1, Number(cfg?.skills?.maxSkillsPerAssignment) || 3);
  return ranked(cfg, context, kind).slice(0, limit).map(({ skill }) => skill.name);
}

// Bir delegasyona istenen beceri adlarini cozer; yalnizca hem var olan hem de kullanicinin
// etkinlestirdigi beceriler donuir. Boylece operator, katalog disinda bir beceri iliştiremez.
function resolveForAssignment(names, cfg) {
  const enabled = enabledNames(cfg);
  const wildcard = enabled.has("*");
  const limit = Math.max(1, Number(cfg?.skills?.maxSkillsPerAssignment) || 3);
  const out = [];
  const seen = new Set();
  for (const name of toList(names)) {
    if (out.length >= limit) break;
    if (seen.has(name) || (!wildcard && !enabled.has(name))) continue;
    const skill = loadSkill(name);
    if (skill) { out.push(skill); seen.add(name); }
  }
  return out;
}

// Progressive disclosure: uzmana becerinin TAM govdesini yigmadan, ad + kisa ozet + rehber dosya
// yolunu verir. Uzman gercekten ihtiyac duyarsa dosyayi kendisi okur. Boylece prompt hafif kalir.
function toPromptRefs(skills, charBudget = 1200) {
  if (!Array.isArray(skills) || !skills.length) return "";
  const lines = [];
  for (const skill of skills) {
    const location = path.join(SKILLS_DIR, skill.file);
    let line = `- ${skill.name}: ${skill.description || "(aciklama yok)"}\n  Rehber: ${location}`;
    if (charBudget && [...lines, line].join("\n").length > charBudget) {
      if (lines.length) break;
      line = `- ${skill.name}\n  Rehber: ${location}`;
      if (line.length > charBudget) break;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function validateSkill(nameOrFile, content) {
  const { meta, body } = parseFrontmatter(content);
  const errors = [];
  const name = String(meta.name || "");
  const expected = slugFor(fileNameFor(nameOrFile));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) errors.push("name kucuk harfli kebab-case ve en fazla 64 karakter olmali");
  if (name && name !== expected) errors.push("frontmatter name dosya adiyla ayni olmali");
  const description = String(meta.description || "").trim();
  if (!description || description.length > 1024) errors.push("description 1-1024 karakter olmali");
  if (!body.trim()) errors.push("beceri govdesi bos olamaz");
  const invalidKinds = toList(meta.appliesTo).filter((kind) => !["implement", "review", "plan", "research"].includes(kind));
  if (invalidKinds.length) errors.push(`gecersiz appliesTo: ${invalidKinds.join(", ")}`);
  return { ok: !errors.length, errors };
}

function writeSkill(nameOrFile, content) {
  ensureDir();
  const file = fileNameFor(nameOrFile);
  fs.writeFileSync(path.join(SKILLS_DIR, file), String(content == null ? "" : content));
  return file;
}

function deleteSkill(nameOrFile) {
  const p = path.join(SKILLS_DIR, fileNameFor(nameOrFile));
  if (fs.existsSync(p)) fs.rmSync(p);
}

module.exports = {
  SKILLS_DIR,
  parseFrontmatter,
  listSkillFiles,
  loadSkill,
  allSkills,
  enabledNames,
  enabledSkills,
  scoreSkill,
  discover,
  catalog,
  catalogStats,
  suggest,
  resolveForAssignment,
  toPromptRefs,
  validateSkill,
  readRaw,
  writeSkill,
  deleteSkill,
};
