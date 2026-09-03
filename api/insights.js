import { createDemoInsights, normalizeInsights } from "../src/insights.mjs";

const MAX_BODY_BYTES = 64 * 1024;
const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";

export const INSIGHTS_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    summary: { type: "string", maxLength: 360 },
    trend: { type: "string", enum: ["up", "stable", "down"] },
    score: { type: "integer", minimum: 0, maximum: 100 },
    wins: { type: "array", items: { type: "string", maxLength: 160 }, maxItems: 3 },
    risks: { type: "array", items: { type: "string", maxLength: 160 }, maxItems: 3 },
    recommendations: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 80 },
          action: { type: "string", maxLength: 180 },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["title", "action", "priority"],
        additionalProperties: false,
      },
    },
    motivationalNote: { type: "string", maxLength: 220 },
  },
  required: ["summary", "trend", "score", "wins", "risks", "recommendations", "motivationalNote"],
  additionalProperties: false,
});

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateInsightsPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Тело запроса должно быть объектом";
  }
  if (![7, 30, 90].includes(payload.periodDays)) {
    return "periodDays должен быть равен 7, 30 или 90";
  }
  if (!payload.overall || typeof payload.overall !== "object") {
    return "Не передана общая статистика";
  }
  if (!isFiniteNumber(payload.overall.completionRate) || payload.overall.completionRate < 0 || payload.overall.completionRate > 100) {
    return "Некорректный процент выполнения";
  }
  if (!Array.isArray(payload.habits) || payload.habits.length < 1 || payload.habits.length > 30) {
    return "Передайте от 1 до 30 привычек";
  }
  for (const habit of payload.habits) {
    if (!habit || typeof habit !== "object" || typeof habit.name !== "string" || habit.name.trim().length < 1 || habit.name.length > 48) {
      return "Некорректная привычка";
    }
    if (!isFiniteNumber(habit.completionRate) || habit.completionRate < 0 || habit.completionRate > 100) {
      return "Некорректная статистика привычки";
    }
  }
  if (!Array.isArray(payload.dailyCompletion) || payload.dailyCompletion.length > 90) {
    return "Некорректная дневная статистика";
  }
  return null;
}

export function buildOpenAIRequest(payload, model = "gpt-5.6") {
  return {
    model,
    store: false,
    reasoning: { effort: "low" },
    max_output_tokens: 1100,
    instructions: [
      "Ты — спокойный аналитик привычек и поведенческий коуч.",
      "Отвечай на русском языке, конкретно и без медицинских утверждений.",
      "Опирайся только на переданные агрегированные данные.",
      "Не стыди пользователя и не советуй добавлять больше двух новых действий одновременно.",
      "Рекомендации должны быть короткими, измеримыми и выполнимыми на следующей неделе.",
    ].join(" "),
    input: [
      {
        role: "user",
        content: `Проанализируй статистику привычек и предложи три следующих шага:\n${JSON.stringify(payload)}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "habit_progress_analysis",
        strict: true,
        schema: INSIGHTS_SCHEMA,
      },
    },
  };
}

export function extractResponseText(responseBody) {
  for (const output of responseBody?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
      if (content?.type === "refusal") throw new Error("MODEL_REFUSAL");
    }
  }
  throw new Error("EMPTY_MODEL_RESPONSE");
}

export async function generateInsights(
  payload,
  {
    apiKey = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_MODEL || "gpt-5.6",
    fetchImplementation = globalThis.fetch,
    timeoutMs = 20_000,
  } = {},
) {
  const validationError = validateInsightsPayload(payload);
  if (validationError) {
    return { status: 400, body: { error: validationError, code: "INVALID_INPUT" } };
  }
  if (!apiKey) {
    return {
      status: 200,
      body: {
        data: createDemoInsights(payload),
        source: "demo",
        code: "AI_NOT_CONFIGURED",
      },
    };
  }
  if (typeof fetchImplementation !== "function") {
    return { status: 503, body: { error: "Сетевой клиент недоступен", code: "FETCH_UNAVAILABLE" } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImplementation(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildOpenAIRequest(payload, model)),
      signal: controller.signal,
    });

    if (!response.ok) {
      const status = response.status === 429 ? 429 : 502;
      const code = response.status === 401 ? "INVALID_API_KEY" : response.status === 429 ? "RATE_LIMITED" : "OPENAI_ERROR";
      return { status, body: { error: "OpenAI API временно недоступен", code } };
    }

    const responseBody = await response.json();
    const parsed = JSON.parse(extractResponseText(responseBody));
    const data = normalizeInsights({ ...parsed, source: "openai" }, payload);
    return { status: 200, body: { data, source: "openai" } };
  } catch (error) {
    const code = error?.name === "AbortError" ? "OPENAI_TIMEOUT" : error?.message === "MODEL_REFUSAL" ? "MODEL_REFUSAL" : "OPENAI_BAD_RESPONSE";
    return { status: 502, body: { error: "Не удалось получить AI-анализ", code } };
  } finally {
    clearTimeout(timeout);
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { error: "Метод не поддерживается", code: "METHOD_NOT_ALLOWED" });
    return;
  }

  try {
    const payload = await readBody(req);
    const result = await generateInsights(payload);
    sendJson(res, result.status, result.body);
  } catch (error) {
    const status = error?.message === "BODY_TOO_LARGE" ? 413 : 400;
    const code = status === 413 ? "BODY_TOO_LARGE" : "INVALID_JSON";
    sendJson(res, status, { error: status === 413 ? "Запрос слишком большой" : "Некорректный JSON", code });
  }
}
