// schedule.js — zamanlanmis gorevlerin saf (yan etkisiz) mantigi: dogrulama ve sonraki
// calisma zamani hesabi. Sifir bagimlilik. Yan etkiler (task uretimi, broadcast) server.js
// zamanlayici tik'indedir; bu modul yalnizca hesap yapar ve boylece kolayca test edilebilir.

const TRIGGER_TYPES = ["interval", "daily", "weekly"];
const VALID_MODES = new Set(["auto", "fast", "balanced", "deep"]);
// Makul ust sinir: 1 dakika .. 60 gun. Cok buyuk araliklar setInterval/Date tasmasi yaratmasin.
const MAX_INTERVAL_MINUTES = 60 * 24 * 60;

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

// "HH:MM" -> {hours, minutes} veya null. 00:00 .. 23:59 araligi disi gecersizdir.
function parseTimeOfDay(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Ham girdiyi dogrulanmis bir tetik nesnesine cevir; gecersizse Error at.
function normalizeTrigger(raw) {
  if (!isPlainObject(raw)) throw new Error("trigger nesnesi gerekli.");
  const type = String(raw.type || "").toLowerCase();
  if (!TRIGGER_TYPES.includes(type)) throw new Error(`trigger.type interval|daily|weekly olmali (verilen: ${type || "yok"}).`);
  if (type === "interval") {
    const everyMinutes = Number(raw.everyMinutes);
    if (!Number.isInteger(everyMinutes) || everyMinutes < 1) throw new Error("trigger.everyMinutes en az 1 tamsayi olmali.");
    if (everyMinutes > MAX_INTERVAL_MINUTES) throw new Error(`trigger.everyMinutes en fazla ${MAX_INTERVAL_MINUTES} olabilir.`);
    return { type, everyMinutes };
  }
  const time = parseTimeOfDay(raw.at);
  if (!time) throw new Error('trigger.at "HH:MM" (00:00–23:59) olmali.');
  const at = `${pad2(time.hours)}:${pad2(time.minutes)}`;
  if (type === "daily") return { type, at };
  // weekly
  const days = Array.isArray(raw.days) ? [...new Set(raw.days.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b) : [];
  if (!days.length) throw new Error("trigger.days en az bir gun (0=Pazar .. 6=Cumartesi) icermeli.");
  return { type, at, days };
}

// Ham zamanlama girdisini dogrulanmis nesneye cevir; gecersizse Error at. Saf: girdiyi
// degistirmez, yeni nesne dondurur. id/createdAt korunur (verilmisse), yoksa cagiran atar.
function normalizeSchedule(raw) {
  if (!isPlainObject(raw)) throw new Error("Zamanlama nesnesi gerekli.");
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  if (!prompt) throw new Error("prompt gerekli.");
  const trigger = normalizeTrigger(raw.trigger);
  const executionMode = VALID_MODES.has(raw.executionMode) ? raw.executionMode : "auto";
  const schedule = {
    id: raw.id ? String(raw.id) : "",
    prompt,
    executionMode,
    trigger,
    enabled: raw.enabled !== false,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
  if (raw.targetDir && String(raw.targetDir).trim()) schedule.targetDir = String(raw.targetDir).trim();
  if (raw.operatorCli && String(raw.operatorCli).trim()) schedule.operatorCli = String(raw.operatorCli).trim();
  if (raw.lastRunAt) schedule.lastRunAt = raw.lastRunAt;
  if (raw.lastTaskId) schedule.lastTaskId = raw.lastTaskId;
  return schedule;
}

// Bir zamanlamanin `from`'dan SONRAKI ilk calisma zamanini hesapla. Donen deger her zaman
// from'dan kesinlikle ileridedir (esitlik degil), boylece ayni tik iki kez tetiklemez.
function computeNextRun(schedule, from = new Date()) {
  const trigger = schedule && schedule.trigger;
  if (!trigger || !TRIGGER_TYPES.includes(trigger.type)) return null;
  const base = from instanceof Date ? from : new Date(from);
  if (Number.isNaN(base.getTime())) return null;

  if (trigger.type === "interval") {
    if (!Number.isInteger(trigger.everyMinutes) || trigger.everyMinutes < 1) return null;
    return new Date(base.getTime() + trigger.everyMinutes * 60000);
  }

  const time = parseTimeOfDay(trigger.at);
  if (!time) return null;

  if (trigger.type === "daily") {
    const next = new Date(base);
    next.setHours(time.hours, time.minutes, 0, 0);
    if (next.getTime() <= base.getTime()) next.setDate(next.getDate() + 1);
    return next;
  }

  if (trigger.type === "weekly") {
    const days = Array.isArray(trigger.days) ? trigger.days : [];
    if (!days.length) return null;
    // Bugun dahil sonraki 7 gunu tara; ilk uygun gun+saat kombinasyonunu dondur.
    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(base);
      candidate.setDate(candidate.getDate() + offset);
      candidate.setHours(time.hours, time.minutes, 0, 0);
      if (days.includes(candidate.getDay()) && candidate.getTime() > base.getTime()) return candidate;
    }
    return null;
  }

  return null;
}

// enabled ve zamani gelmis (nextRunAt <= now) zamanlamalari dondur. nextRunAt yoksa
// (ör. yeni tanimlanmis ama hesaplanmamis) zamani gelmemis sayilir; server tik'i yaratirken
// nextRunAt'i doldurur.
function dueSchedules(schedules, now = new Date()) {
  const at = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Array.isArray(schedules)) return [];
  return schedules.filter((s) => {
    if (!s || s.enabled === false) return false;
    const next = s.nextRunAt ? Date.parse(s.nextRunAt) : NaN;
    return Number.isFinite(next) && next <= at;
  });
}

module.exports = { normalizeSchedule, normalizeTrigger, computeNextRun, dueSchedules, parseTimeOfDay, TRIGGER_TYPES, MAX_INTERVAL_MINUTES };
