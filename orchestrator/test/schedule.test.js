const assert = require("assert");
const schedule = require("../src/schedule");

function main() {
  // ---- normalizeSchedule dogrulama ----
  assert.throws(() => schedule.normalizeSchedule(null), /gerekli/, "nesne olmayan girdi reddedilmeli");
  assert.throws(() => schedule.normalizeSchedule({ trigger: { type: "interval", everyMinutes: 5 } }), /prompt/, "prompt zorunlu");
  assert.throws(() => schedule.normalizeSchedule({ prompt: "x", trigger: { type: "sacma" } }), /interval\|daily\|weekly/, "gecersiz trigger tipi reddedilmeli");
  assert.throws(() => schedule.normalizeSchedule({ prompt: "x", trigger: { type: "interval", everyMinutes: 0 } }), /en az 1/, "everyMinutes >= 1 olmali");
  assert.throws(() => schedule.normalizeSchedule({ prompt: "x", trigger: { type: "daily", at: "25:00" } }), /HH:MM/, "gecersiz saat reddedilmeli");
  assert.throws(() => schedule.normalizeSchedule({ prompt: "x", trigger: { type: "weekly", at: "09:00", days: [] } }), /en az bir gun/, "haftalik gun bos olamaz");

  const interval = schedule.normalizeSchedule({ prompt: "  testleri calistir  ", trigger: { type: "interval", everyMinutes: 15 }, executionMode: "balanced" });
  assert.equal(interval.prompt, "testleri calistir", "prompt trim'lenmeli");
  assert.equal(interval.executionMode, "balanced");
  assert.equal(interval.enabled, true, "varsayilan aktif");
  assert.equal(interval.trigger.everyMinutes, 15);

  const badMode = schedule.normalizeSchedule({ prompt: "x", trigger: { type: "interval", everyMinutes: 5 }, executionMode: "hız" });
  assert.equal(badMode.executionMode, "auto", "gecersiz mod auto'ya duser");

  const weekly = schedule.normalizeSchedule({ prompt: "x", trigger: { type: "weekly", at: "9:05", days: [5, 1, 1, 3, 9, -1] } });
  assert.deepEqual(weekly.trigger.days, [1, 3, 5], "gunler tekillestirilip siralanmali, gecersizler atilmali");
  assert.equal(weekly.trigger.at, "09:05", "saat sifir dolgulu olmali");

  // Saf: girdi degistirilmemeli, tekrar normalize idempotent olmali.
  const raw = { prompt: "x", trigger: { type: "daily", at: "08:30" } };
  const snapshot = JSON.stringify(raw);
  const once = schedule.normalizeSchedule(raw);
  assert.equal(JSON.stringify(raw), snapshot, "normalizeSchedule girdiyi degistirmemeli");
  const twice = schedule.normalizeSchedule({ ...once });
  assert.deepEqual({ ...twice, createdAt: once.createdAt }, once, "normalizeSchedule idempotent olmali");

  // ---- computeNextRun: interval ----
  const from = new Date("2026-07-18T10:00:00");
  const nextInterval = schedule.computeNextRun({ trigger: { type: "interval", everyMinutes: 30 } }, from);
  assert.equal(nextInterval.getTime(), from.getTime() + 30 * 60000, "interval: from + N dakika");

  // ---- computeNextRun: daily ----
  const dailyLater = schedule.computeNextRun({ trigger: { type: "daily", at: "14:00" } }, from);
  assert.equal(dailyLater.getDate(), 18, "bugun gec bir saat ise ayni gun");
  assert.equal(dailyLater.getHours(), 14);
  const dailyPassed = schedule.computeNextRun({ trigger: { type: "daily", at: "09:00" } }, from);
  assert.equal(dailyPassed.getDate(), 19, "gunun saati gectiyse ertesi gun");
  assert.equal(dailyPassed.getHours(), 9);
  // Tam esitlikte (saat = simdi) bir sonraki gune kaymali (esitlik degil, kesin ileri).
  const dailyEqual = schedule.computeNextRun({ trigger: { type: "daily", at: "10:00" } }, from);
  assert.equal(dailyEqual.getDate(), 19, "saat tam simdiyse ertesi gune kaymali");

  // ---- computeNextRun: weekly ----
  // 2026-07-18 Cumartesi (getDay()===6). Pazartesi(1) 09:00 istenirse sonraki Pazartesi.
  const weeklyNext = schedule.computeNextRun({ trigger: { type: "weekly", at: "09:00", days: [1] } }, from);
  assert.equal(weeklyNext.getDay(), 1, "haftalik: dogru gune denk gelmeli");
  assert.ok(weeklyNext.getTime() > from.getTime(), "haftalik: gelecekte olmali");
  // Bugun (Cumartesi=6) 14:00 istenirse ayni gun (saat henuz gelmedi).
  const weeklyToday = schedule.computeNextRun({ trigger: { type: "weekly", at: "14:00", days: [6] } }, from);
  assert.equal(weeklyToday.getDate(), 18, "haftalik: bugun ve saat gelmediyse ayni gun");

  // ---- dueSchedules ----
  const now = new Date("2026-07-18T12:00:00");
  const list = [
    { id: "a", enabled: true, nextRunAt: "2026-07-18T11:59:00", trigger: { type: "interval", everyMinutes: 5 } },
    { id: "b", enabled: true, nextRunAt: "2026-07-18T12:30:00", trigger: { type: "interval", everyMinutes: 5 } },
    { id: "c", enabled: false, nextRunAt: "2026-07-18T10:00:00", trigger: { type: "interval", everyMinutes: 5 } },
    { id: "d", enabled: true, trigger: { type: "interval", everyMinutes: 5 } },
  ];
  const due = schedule.dueSchedules(list, now).map((s) => s.id);
  assert.deepEqual(due, ["a"], "yalnizca zamani gelmis+aktif+nextRunAt'li zamanlama tetiklenmeli");
  assert.deepEqual(schedule.dueSchedules(null, now), [], "gecersiz liste bos donmeli");

  console.log("schedule ok");
}

main();
