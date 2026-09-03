import test from "node:test";
import assert from "node:assert/strict";
import { generateInsights } from "../api/insights.js";
import { calculateDashboardStats, toDateKey } from "../src/analytics.mjs";
import { buildInsightsPayload } from "../src/insights.mjs";
import { createHabitStore } from "../src/store.mjs";

class MemoryStorage {
  #items = new Map();
  getItem(key) { return this.#items.get(key) ?? null; }
  setItem(key, value) { this.#items.set(key, String(value)); }
}

test("full user journey: add, complete, filter, reload and analyze", async () => {
  const fixedDate = new Date(2026, 8, 1, 12, 0, 0);
  const now = () => new Date(fixedDate);
  const storage = new MemoryStorage();
  const store = createHabitStore(storage, now);

  const initial = calculateDashboardStats(store.getState().habits, { days: 7, endDate: fixedDate });
  assert.equal(initial.todayCompleted, 3);
  assert.equal(initial.todayTotal, 6);

  const habitId = store.addHabit({
    name: "Практика английского",
    category: "growth",
    emoji: "📚",
    targetPerWeek: 4,
  });
  store.toggleEntry(habitId, toDateKey(fixedDate));

  const updated = calculateDashboardStats(store.getState().habits, { days: 7, endDate: fixedDate });
  assert.equal(updated.todayCompleted, 4);
  assert.equal(updated.todayTotal, 7);

  const reloadedStore = createHabitStore(storage, now);
  const persistedHabit = reloadedStore.getState().habits.find((habit) => habit.id === habitId);
  assert.equal(persistedHabit.name, "Практика английского");
  assert.equal(persistedHabit.entries["2026-09-01"], true);

  reloadedStore.setSettings({ category: "growth", range: 30 });
  const filtered = calculateDashboardStats(reloadedStore.getState().habits, {
    days: reloadedStore.getState().settings.range,
    category: reloadedStore.getState().settings.category,
    endDate: fixedDate,
  });
  assert.equal(filtered.selectedHabits.length, 2);

  const apiResult = await generateInsights(buildInsightsPayload(filtered), { apiKey: "" });
  assert.equal(apiResult.status, 200);
  assert.equal(apiResult.body.source, "demo");
  assert.equal(apiResult.body.data.recommendations.length, 3);
});
