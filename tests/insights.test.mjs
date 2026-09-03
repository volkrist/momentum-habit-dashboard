import test from "node:test";
import assert from "node:assert/strict";
import { createDemoInsights, normalizeInsights, requestInsights } from "../src/insights.mjs";

const payload = {
  periodDays: 7,
  overall: { completionRate: 68, previousRate: 60, delta: 8, currentStreak: 4, completed: 19, possible: 28 },
  habits: [
    { name: "Чтение", completionRate: 85, currentStreak: 5, bestStreak: 8, completedThisWeek: 6 },
    { name: "Спорт", completionRate: 42, currentStreak: 1, bestStreak: 3, completedThisWeek: 3 },
  ],
  dailyCompletion: [40, 55, 60, 70, 75, 80, 90].map((rate, index) => ({ date: `2026-08-${25 + index}`, rate })),
};

test("demo analysis produces user-facing cards instead of raw JSON", () => {
  const result = createDemoInsights(payload);
  assert.equal(result.source, "demo");
  assert.ok(result.summary.includes("68%"));
  assert.equal(result.recommendations.length, 3);
  assert.ok(result.score >= 0 && result.score <= 100);
});

test("normalizer constrains an untrusted model response", () => {
  const result = normalizeInsights({
    summary: "ok",
    trend: "unknown",
    score: 999,
    wins: ["one"],
    risks: [],
    recommendations: [{ title: "step", action: "act", priority: "strange" }],
    motivationalNote: "go",
    source: "openai",
  }, payload);

  assert.equal(result.trend, "up");
  assert.equal(result.score, 100);
  assert.equal(result.recommendations[0].priority, "medium");
  assert.equal(result.source, "openai");
});

test("client falls back to demo analysis on an unconfigured API", async () => {
  const result = await requestInsights(payload, async () => ({
    ok: false,
    status: 503,
    json: async () => ({ code: "AI_NOT_CONFIGURED" }),
  }));
  assert.equal(result.source, "demo");
  assert.equal(result.fallbackReason, "AI_NOT_CONFIGURED");
});
