import { CATEGORY_META, getDateKeys, toDateKey } from "./analytics.mjs";

const HABIT_BLUEPRINTS = [
  { id: "water", name: "Вода после пробуждения", emoji: "💧", category: "health", targetPerWeek: 7, chance: 86, seed: 3 },
  { id: "focus", name: "Фокус без уведомлений", emoji: "🎯", category: "focus", targetPerWeek: 5, chance: 72, seed: 7 },
  { id: "reading", name: "Читать 20 минут", emoji: "📚", category: "growth", targetPerWeek: 5, chance: 64, seed: 11 },
  { id: "training", name: "Тренировка", emoji: "🏃", category: "health", targetPerWeek: 4, chance: 49, seed: 17 },
  { id: "meditation", name: "Спокойные 10 минут", emoji: "🧘", category: "balance", targetPerWeek: 5, chance: 57, seed: 23 },
  { id: "sleep", name: "Сон до полуночи", emoji: "🌙", category: "balance", targetPerWeek: 6, chance: 68, seed: 29 },
];

function deterministicScore(key, seed) {
  const digits = Number(key.replaceAll("-", ""));
  return (digits * (seed + 13) + seed * 37) % 100;
}

function buildEntries(blueprint, now) {
  const entries = {};
  const keys = getDateKeys(90, now);

  keys.forEach((key, index) => {
    const weekday = new Date(`${key}T12:00:00`).getDay();
    const weekendAdjustment = weekday === 0 || weekday === 6 ? -5 : 3;
    const momentumAdjustment = Math.floor(index / 18) * 2;
    const threshold = Math.min(94, blueprint.chance + weekendAdjustment + momentumAdjustment);
    if (deterministicScore(key, blueprint.seed) < threshold) entries[key] = true;
  });

  return entries;
}

export function createDemoHabits(now = new Date()) {
  const todayKey = toDateKey(now);

  return HABIT_BLUEPRINTS.map((blueprint, index) => {
    const category = CATEGORY_META[blueprint.category];
    const entries = buildEntries(blueprint, now);
    if (index < 3) entries[todayKey] = true;
    else delete entries[todayKey];

    return {
      id: blueprint.id,
      name: blueprint.name,
      emoji: blueprint.emoji,
      category: blueprint.category,
      targetPerWeek: blueprint.targetPerWeek,
      color: category.color,
      soft: category.soft,
      createdAt: new Date(now.getTime() - 90 * 86400000).toISOString(),
      entries,
    };
  });
}

export function createDefaultState(now = new Date()) {
  return {
    version: 1,
    settings: {
      range: 7,
      category: "all",
      theme: "light",
    },
    habits: createDemoHabits(now),
    insights: null,
    updatedAt: now.toISOString(),
  };
}
