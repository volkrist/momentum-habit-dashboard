import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOpenAIRequest,
  extractResponseText,
  generateInsights,
  validateInsightsPayload,
} from "../api/insights.js";

const payload = {
  periodDays: 7,
  overall: { completionRate: 75, previousRate: 68, delta: 7, currentStreak: 5, completed: 21, possible: 28 },
  habits: [{ name: "Чтение", completionRate: 75, currentStreak: 5, bestStreak: 8, completedThisWeek: 5 }],
  dailyCompletion: [{ date: "2026-09-01", rate: 100 }],
};

const modelResult = {
  summary: "Ритм устойчивый.",
  trend: "up",
  score: 81,
  wins: ["Хорошая серия."],
  risks: [],
  recommendations: [{ title: "Сохранить время", action: "Повторять утром.", priority: "medium" }],
  motivationalNote: "Продолжайте.",
};

test("API input validation rejects invalid payloads", () => {
  assert.match(validateInsightsPayload({}), /periodDays/);
  assert.equal(validateInsightsPayload(payload), null);
});

test("OpenAI request uses Responses API structured output", () => {
  const request = buildOpenAIRequest(payload, "test-model");
  assert.equal(request.model, "test-model");
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.schema.additionalProperties, false);
});

test("response parser extracts output_text", () => {
  const text = extractResponseText({ output: [{ content: [{ type: "output_text", text: "hello" }] }] });
  assert.equal(text, "hello");
});

test("API returns a working demo analysis when the key is absent", async () => {
  const result = await generateInsights(payload, { apiKey: "" });
  assert.equal(result.status, 200);
  assert.equal(result.body.code, "AI_NOT_CONFIGURED");
  assert.equal(result.body.source, "demo");
  assert.equal(result.body.data.source, "demo");
});

test("API maps a successful provider response to safe UI data", async () => {
  let receivedRequest;
  const fakeFetch = async (_url, options) => {
    receivedRequest = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        output: [{ content: [{ type: "output_text", text: JSON.stringify(modelResult) }] }],
      }),
    };
  };

  const result = await generateInsights(payload, {
    apiKey: "test-key-not-real",
    fetchImplementation: fakeFetch,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.source, "openai");
  assert.equal(result.body.data.score, 81);
  assert.equal(receivedRequest.text.format.name, "habit_progress_analysis");
});

test("API handles rate limits without leaking provider response", async () => {
  const result = await generateInsights(payload, {
    apiKey: "test-key-not-real",
    fetchImplementation: async () => ({ ok: false, status: 429 }),
  });
  assert.equal(result.status, 429);
  assert.deepEqual(result.body, { error: "OpenAI API временно недоступен", code: "RATE_LIMITED" });
});
