function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function cleanText(value, fallback, limit = 220) {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, limit);
}

export function buildInsightsPayload(stats) {
  return {
    periodDays: stats.dateKeys.length,
    overall: {
      completionRate: stats.rate,
      previousRate: stats.previousRate,
      delta: stats.rateDelta,
      currentStreak: stats.currentStreak,
      completed: stats.completed,
      possible: stats.possible,
    },
    habits: stats.perHabit.map((habit) => ({
      name: habit.name,
      completionRate: habit.rate,
      currentStreak: habit.currentStreak,
      bestStreak: habit.bestStreak,
      completedThisWeek: habit.completedThisWeek,
    })),
    dailyCompletion: stats.dailySeries.map((day) => ({ date: day.key, rate: day.value })),
  };
}

export function createDemoInsights(payload) {
  const habits = Array.isArray(payload?.habits) ? payload.habits : [];
  const rate = Number(payload?.overall?.completionRate) || 0;
  const delta = Number(payload?.overall?.delta) || 0;
  const values = (payload?.dailyCompletion ?? []).map((day) => Number(day.rate) || 0);
  const midpoint = Math.max(1, Math.floor(values.length / 2));
  const early = average(values.slice(0, midpoint));
  const late = average(values.slice(midpoint));
  const trend = late > early + 5 ? "up" : late < early - 5 ? "down" : "stable";
  const sorted = [...habits].sort((a, b) => b.completionRate - a.completionRate);
  const strongest = sorted[0];
  const weakest = sorted.at(-1);
  const score = Math.round(Math.min(100, rate * 0.82 + Math.min(18, (payload?.overall?.currentStreak || 0) * 2)));

  const recommendations = [];
  if (weakest && weakest.completionRate < 65) {
    recommendations.push({
      title: `Упростить «${weakest.name}»`,
      action: "Снизьте первый шаг до двух минут и привяжите его к уже привычному действию.",
      priority: "high",
    });
  }
  if (trend === "down") {
    recommendations.push({
      title: "Вернуть короткий ритм",
      action: "На три дня оставьте только две главные привычки, затем добавьте остальные.",
      priority: "high",
    });
  } else {
    recommendations.push({
      title: "Закрепить лучшее время",
      action: "Повторяйте ключевую привычку в тот же час — это уменьшит количество решений.",
      priority: "medium",
    });
  }
  recommendations.push({
    title: "Подготовить среду вечером",
    action: "Оставьте один видимый триггер для самой важной привычки следующего дня.",
    priority: "low",
  });

  return {
    summary: rate >= 75
      ? `Ритм устойчивый: выполнено ${rate}% запланированных действий. Сейчас важнее сохранить простоту, чем добавлять новые цели.`
      : `Текущий результат — ${rate}%. Ритм уже сформирован, но ему поможет более короткий и предсказуемый первый шаг.`,
    trend,
    score,
    wins: strongest ? [`Самая устойчивая привычка — «${strongest.name}» (${strongest.completionRate}%).`] : [],
    risks: weakest && weakest.completionRate < 50 ? [`«${weakest.name}» пока легко выпадает из графика.`] : [],
    recommendations: recommendations.slice(0, 3),
    motivationalNote: delta >= 0
      ? "Продолжайте в том же темпе: устойчивость важнее идеальной серии."
      : "Один слабый период не отменяет прогресс — вернитесь к самому маленькому действию.",
    source: "demo",
    generatedAt: new Date().toISOString(),
  };
}

export function normalizeInsights(candidate, fallbackPayload) {
  const fallback = createDemoInsights(fallbackPayload);
  const allowedTrends = new Set(["up", "stable", "down"]);
  const recommendations = Array.isArray(candidate?.recommendations)
    ? candidate.recommendations.slice(0, 3).map((item, index) => ({
        title: cleanText(item?.title, fallback.recommendations[index]?.title || "Следующий шаг", 80),
        action: cleanText(item?.action, fallback.recommendations[index]?.action || "Продолжайте выбранный ритм.", 180),
        priority: ["high", "medium", "low"].includes(item?.priority) ? item.priority : "medium",
      }))
    : fallback.recommendations;

  return {
    summary: cleanText(candidate?.summary, fallback.summary, 360),
    trend: allowedTrends.has(candidate?.trend) ? candidate.trend : fallback.trend,
    score: Math.min(100, Math.max(0, Math.round(Number(candidate?.score) || fallback.score))),
    wins: Array.isArray(candidate?.wins) ? candidate.wins.slice(0, 3).map((item) => cleanText(item, "", 160)).filter(Boolean) : fallback.wins,
    risks: Array.isArray(candidate?.risks) ? candidate.risks.slice(0, 3).map((item) => cleanText(item, "", 160)).filter(Boolean) : fallback.risks,
    recommendations,
    motivationalNote: cleanText(candidate?.motivationalNote, fallback.motivationalNote, 220),
    source: candidate?.source === "openai" ? "openai" : "demo",
    generatedAt: candidate?.generatedAt || new Date().toISOString(),
  };
}

export async function requestInsights(payload, fetchImplementation = globalThis.fetch) {
  if (typeof fetchImplementation !== "function") return createDemoInsights(payload);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);

  try {
    const response = await fetchImplementation("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const fallback = createDemoInsights(payload);
      fallback.fallbackReason = error.code || `HTTP_${response.status}`;
      return fallback;
    }

    const body = await response.json();
    return normalizeInsights({ ...body.data, source: body.source || "openai" }, payload);
  } catch (error) {
    const fallback = createDemoInsights(payload);
    fallback.fallbackReason = error?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR";
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
