import { CATEGORY_META } from "./analytics.mjs";
import { createDefaultState } from "./demo-data.mjs";

export const STORAGE_KEY = "momentum.habits.v1";

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `habit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeHabit(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const name = String(candidate.name ?? "").trim().slice(0, 48);
  if (!name) return null;

  const category = Object.hasOwn(CATEGORY_META, candidate.category)
    ? candidate.category
    : "health";
  const categoryMeta = CATEGORY_META[category];
  const entries = {};

  if (candidate.entries && typeof candidate.entries === "object") {
    for (const [key, value] of Object.entries(candidate.entries)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && value === true) entries[key] = true;
    }
  }

  return {
    id: String(candidate.id || createId()),
    name,
    emoji: String(candidate.emoji || "🎯").slice(0, 4),
    category,
    targetPerWeek: Math.min(7, Math.max(1, Number(candidate.targetPerWeek) || 5)),
    color: categoryMeta.color,
    soft: categoryMeta.soft,
    createdAt: candidate.createdAt || new Date().toISOString(),
    entries,
  };
}

export function normalizeState(candidate, now = new Date()) {
  const fallback = createDefaultState(now);
  if (!candidate || typeof candidate !== "object") return fallback;

  const habits = Array.isArray(candidate.habits)
    ? candidate.habits.map(normalizeHabit).filter(Boolean).slice(0, 30)
    : fallback.habits;
  const range = [7, 30, 90].includes(Number(candidate.settings?.range))
    ? Number(candidate.settings.range)
    : 7;
  const category = candidate.settings?.category === "all" || Object.hasOwn(CATEGORY_META, candidate.settings?.category)
    ? candidate.settings.category
    : "all";
  const theme = candidate.settings?.theme === "dark" ? "dark" : "light";

  return {
    version: 1,
    settings: { range, category, theme },
    habits,
    insights: candidate.insights && typeof candidate.insights === "object" ? candidate.insights : null,
    updatedAt: candidate.updatedAt || now.toISOString(),
  };
}

export function loadState(storage, now = new Date()) {
  if (!storage) return createDefaultState(now);
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw), now) : createDefaultState(now);
  } catch {
    return createDefaultState(now);
  }
}

export function createHabitStore(storage = globalThis.localStorage, nowProvider = () => new Date()) {
  let state = loadState(storage, nowProvider());
  const listeners = new Set();
  let lastSaveSucceeded = true;

  function persist() {
    state.updatedAt = nowProvider().toISOString();
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
      lastSaveSucceeded = true;
    } catch {
      lastSaveSucceeded = false;
    }
  }

  function emit() {
    for (const listener of listeners) listener(clone(state), lastSaveSucceeded);
  }

  function commit(updater) {
    const draft = clone(state);
    updater(draft);
    state = normalizeState(draft, nowProvider());
    persist();
    emit();
  }

  return {
    getState: () => clone(state),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    addHabit(input) {
      const habit = normalizeHabit({ ...input, id: createId(), createdAt: nowProvider().toISOString(), entries: {} });
      if (!habit) throw new Error("Название привычки обязательно");
      commit((draft) => {
        if (draft.habits.length >= 30) throw new Error("Можно добавить не более 30 привычек");
        draft.habits.push(habit);
        draft.insights = null;
      });
      return habit.id;
    },
    updateHabit(id, input) {
      commit((draft) => {
        const index = draft.habits.findIndex((habit) => habit.id === id);
        if (index === -1) throw new Error("Привычка не найдена");
        const updated = normalizeHabit({ ...draft.habits[index], ...input, id });
        if (!updated) throw new Error("Название привычки обязательно");
        draft.habits[index] = updated;
        draft.insights = null;
      });
    },
    removeHabit(id) {
      commit((draft) => {
        draft.habits = draft.habits.filter((habit) => habit.id !== id);
        draft.insights = null;
      });
    },
    toggleEntry(id, dateKey) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("Некорректная дата");
      commit((draft) => {
        const habit = draft.habits.find((item) => item.id === id);
        if (!habit) throw new Error("Привычка не найдена");
        if (habit.entries[dateKey]) delete habit.entries[dateKey];
        else habit.entries[dateKey] = true;
        draft.insights = null;
      });
    },
    setSettings(settings) {
      commit((draft) => {
        draft.settings = { ...draft.settings, ...settings };
      });
    },
    setInsights(insights) {
      commit((draft) => {
        draft.insights = insights;
      });
    },
    reset() {
      state = createDefaultState(nowProvider());
      persist();
      emit();
    },
    exportData() {
      return JSON.stringify(state, null, 2);
    },
  };
}
