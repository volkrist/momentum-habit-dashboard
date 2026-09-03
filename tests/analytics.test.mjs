import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBestStreak,
  calculateCurrentStreak,
  calculateDashboardStats,
  getDateKeys,
  shiftDateKey,
  toDateKey,
} from "../src/analytics.mjs";

const fixedNow = new Date(2026, 8, 1, 12, 0, 0);

test("date helpers keep local calendar dates stable", () => {
  assert.equal(toDateKey(fixedNow), "2026-09-01");
  assert.equal(shiftDateKey("2026-03-01", -1), "2026-02-28");
  assert.deepEqual(getDateKeys(3, fixedNow), ["2026-08-30", "2026-08-31", "2026-09-01"]);
});

test("current streak may continue from yesterday when today is unfinished", () => {
  const habit = { entries: { "2026-08-29": true, "2026-08-30": true, "2026-08-31": true } };
  assert.equal(calculateCurrentStreak(habit, "2026-09-01"), 3);
});

test("best streak handles gaps", () => {
  const habit = {
    entries: {
      "2026-08-01": true,
      "2026-08-02": true,
      "2026-08-04": true,
      "2026-08-05": true,
      "2026-08-06": true,
    },
  };
  assert.equal(calculateBestStreak(habit), 3);
});

test("dashboard statistics calculate rate, totals and filter", () => {
  const habits = [
    {
      id: "a",
      name: "A",
      category: "health",
      entries: { "2026-08-31": true, "2026-09-01": true },
    },
    {
      id: "b",
      name: "B",
      category: "focus",
      entries: { "2026-09-01": true },
    },
  ];

  const all = calculateDashboardStats(habits, { days: 7, endDate: fixedNow });
  assert.equal(all.completed, 3);
  assert.equal(all.possible, 14);
  assert.equal(all.rate, 21);
  assert.equal(all.todayCompleted, 2);
  assert.equal(all.todayRate, 100);

  const health = calculateDashboardStats(habits, { days: 7, category: "health", endDate: fixedNow });
  assert.equal(health.selectedHabits.length, 1);
  assert.equal(health.completed, 2);
  assert.equal(health.todayCompleted, 1);
});

test("empty dashboard returns safe zero values", () => {
  const stats = calculateDashboardStats([], { days: 7, endDate: fixedNow });
  assert.equal(stats.rate, 0);
  assert.equal(stats.todayRate, 0);
  assert.equal(stats.bestHabitName, "Пока нет данных");
  assert.equal(stats.dailySeries.length, 7);
});
