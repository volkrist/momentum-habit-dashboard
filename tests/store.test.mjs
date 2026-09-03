import test from "node:test";
import assert from "node:assert/strict";
import { createHabitStore, STORAGE_KEY } from "../src/store.mjs";

class MemoryStorage {
  #items = new Map();
  getItem(key) { return this.#items.get(key) ?? null; }
  setItem(key, value) { this.#items.set(key, String(value)); }
  removeItem(key) { this.#items.delete(key); }
}

const now = () => new Date(2026, 8, 1, 12, 0, 0);

test("store persists a new habit and sanitizes its model", () => {
  const storage = new MemoryStorage();
  const store = createHabitStore(storage, now);
  const id = store.addHabit({ name: "  Новая привычка  ", category: "growth", emoji: "📚", targetPerWeek: 9 });
  const habit = store.getState().habits.find((item) => item.id === id);

  assert.equal(habit.name, "Новая привычка");
  assert.equal(habit.targetPerWeek, 7);
  assert.ok(storage.getItem(STORAGE_KEY));
});

test("toggle entry is persisted and can be reverted", () => {
  const storage = new MemoryStorage();
  const store = createHabitStore(storage, now);
  const id = store.getState().habits[0].id;

  store.toggleEntry(id, "2026-09-01");
  assert.equal(store.getState().habits[0].entries["2026-09-01"], undefined);
  store.toggleEntry(id, "2026-09-01");
  assert.equal(store.getState().habits[0].entries["2026-09-01"], true);
});

test("corrupt localStorage falls back to valid demo data", () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEY, "not-json");
  const store = createHabitStore(storage, now);
  assert.equal(store.getState().habits.length, 6);
});

test("removing a habit also clears stale insights", () => {
  const storage = new MemoryStorage();
  const store = createHabitStore(storage, now);
  const id = store.getState().habits[0].id;
  store.setInsights({ summary: "old" });
  store.removeHabit(id);
  assert.equal(store.getState().insights, null);
  assert.equal(store.getState().habits.some((habit) => habit.id === id), false);
});
