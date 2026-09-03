export const CATEGORY_META = Object.freeze({
  health: { label: "Здоровье", color: "#36b66d", soft: "rgba(54, 182, 109, 0.12)" },
  focus: { label: "Фокус", color: "#5798ec", soft: "rgba(87, 152, 236, 0.12)" },
  growth: { label: "Развитие", color: "#9f78df", soft: "rgba(159, 120, 223, 0.12)" },
  balance: { label: "Баланс", color: "#f29b58", soft: "rgba(242, 155, 88, 0.13)" },
});

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function toDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(key) {
  const [year, month, day] = String(key).split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function shiftDateKey(key, amount) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function getDateKeys(days, endDate = new Date()) {
  const safeDays = clamp(Number(days) || 7, 1, 366);
  const endKey = toDateKey(endDate);
  return Array.from({ length: safeDays }, (_, index) =>
    shiftDateKey(endKey, index - safeDays + 1),
  );
}

export function formatShortDate(key) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })
    .format(fromDateKey(key))
    .replace(".", "");
}

export function formatWeekday(key) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short" })
    .format(fromDateKey(key))
    .replace(".", "");
}

function completionCount(habits, dateKeys) {
  return habits.reduce(
    (sum, habit) => sum + dateKeys.reduce((count, key) => count + Number(Boolean(habit.entries?.[key])), 0),
    0,
  );
}

function completionRate(habits, dateKeys) {
  const possible = habits.length * dateKeys.length;
  return possible === 0 ? 0 : Math.round((completionCount(habits, dateKeys) / possible) * 100);
}

export function calculateCurrentStreak(habit, todayKey = toDateKey()) {
  if (!habit?.entries) return 0;

  let cursor = todayKey;
  if (!habit.entries[cursor]) cursor = shiftDateKey(cursor, -1);

  let streak = 0;
  while (habit.entries[cursor] && streak < 3660) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

export function calculateBestStreak(habit) {
  const completedKeys = Object.keys(habit?.entries ?? {})
    .filter((key) => habit.entries[key])
    .sort();

  let best = 0;
  let current = 0;
  let previous = null;

  for (const key of completedKeys) {
    current = previous && shiftDateKey(previous, 1) === key ? current + 1 : 1;
    best = Math.max(best, current);
    previous = key;
  }
  return best;
}

export function calculateDashboardStats(
  habits,
  { days = 7, category = "all", endDate = new Date() } = {},
) {
  const allHabits = Array.isArray(habits) ? habits : [];
  const selectedHabits = category === "all"
    ? allHabits
    : allHabits.filter((habit) => habit.category === category);

  const dateKeys = getDateKeys(days, endDate);
  const todayKey = toDateKey(endDate);
  const previousEndKey = shiftDateKey(dateKeys[0], -1);
  const previousKeys = getDateKeys(dateKeys.length, fromDateKey(previousEndKey));
  const completed = completionCount(selectedHabits, dateKeys);
  const rate = completionRate(selectedHabits, dateKeys);
  const previousRate = completionRate(selectedHabits, previousKeys);

  const perHabit = selectedHabits.map((habit) => {
    const currentStreak = calculateCurrentStreak(habit, todayKey);
    const bestStreak = calculateBestStreak(habit);
    const completedInPeriod = dateKeys.reduce(
      (count, key) => count + Number(Boolean(habit.entries?.[key])),
      0,
    );
    const lastWeekKeys = dateKeys.slice(-7);
    const completedThisWeek = lastWeekKeys.reduce(
      (count, key) => count + Number(Boolean(habit.entries?.[key])),
      0,
    );

    return {
      id: habit.id,
      name: habit.name,
      rate: dateKeys.length === 0 ? 0 : Math.round((completedInPeriod / dateKeys.length) * 100),
      completedInPeriod,
      completedThisWeek,
      currentStreak,
      bestStreak,
    };
  });

  const bestHabit = perHabit.reduce(
    (best, item) => (item.bestStreak > (best?.bestStreak ?? -1) ? item : best),
    null,
  );
  const currentStreak = perHabit.reduce((max, item) => Math.max(max, item.currentStreak), 0);
  const todayCompleted = selectedHabits.reduce(
    (sum, habit) => sum + Number(Boolean(habit.entries?.[todayKey])),
    0,
  );

  const dailySeries = dateKeys.map((key) => ({
    key,
    label: formatShortDate(key),
    value: completionRate(selectedHabits, [key]),
    completed: completionCount(selectedHabits, [key]),
  }));

  const categoryTotals = Object.entries(CATEGORY_META).map(([key, meta]) => ({
    key,
    ...meta,
    value: completionCount(selectedHabits.filter((habit) => habit.category === key), dateKeys),
  }));

  const heatmapKeys = getDateKeys(84, endDate);
  const heatmap = heatmapKeys.map((key) => {
    const value = completionCount(selectedHabits, [key]);
    const ratio = selectedHabits.length === 0 ? 0 : value / selectedHabits.length;
    return {
      key,
      value,
      level: ratio === 0 ? 0 : clamp(Math.ceil(ratio * 4), 1, 4),
    };
  });

  return {
    selectedHabits,
    dateKeys,
    weekKeys: getDateKeys(7, endDate),
    todayKey,
    completed,
    possible: selectedHabits.length * dateKeys.length,
    rate,
    previousRate,
    rateDelta: rate - previousRate,
    todayCompleted,
    todayTotal: selectedHabits.length,
    todayRate: selectedHabits.length === 0 ? 0 : Math.round((todayCompleted / selectedHabits.length) * 100),
    currentStreak,
    bestStreak: bestHabit?.bestStreak ?? 0,
    bestHabitName: bestHabit?.name ?? "Пока нет данных",
    perHabit,
    dailySeries,
    categoryTotals,
    heatmap,
  };
}
