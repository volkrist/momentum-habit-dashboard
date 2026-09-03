import { spawn } from "node:child_process";

const port = 4181;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", OPENAI_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function waitUntilReady() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Локальный сервер не запустился за 5 секунд")), 5000);
    server.once("error", reject);
    server.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Momentum запущен")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

const payload = {
  periodDays: 7,
  overall: { completionRate: 75, previousRate: 68, delta: 7, currentStreak: 5, completed: 21, possible: 28 },
  habits: [{ name: "Чтение", completionRate: 75, currentStreak: 5, bestStreak: 8, completedThisWeek: 5 }],
  dailyCompletion: [{ date: "2026-09-01", rate: 100 }],
};

try {
  await waitUntilReady();

  const page = await fetch(`${origin}/`);
  assert(page.status === 200, `GET / вернул ${page.status}`);
  assert(page.headers.get("content-type")?.includes("text/html"), "GET / вернул неверный Content-Type");
  assert(page.headers.get("content-security-policy")?.includes("default-src 'self'"), "CSP header отсутствует");
  assert((await page.text()).includes("Momentum"), "Главная страница не содержит приложение");

  const health = await fetch(`${origin}/api/health`).then((response) => response.json());
  assert(health.ok === true && health.aiConfigured === false, "Health endpoint вернул неверный статус");

  const invalid = await fetch(`${origin}/api/insights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert(invalid.status === 400, `Некорректный запрос вернул ${invalid.status}`);

  const analysis = await fetch(`${origin}/api/insights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const analysisBody = await analysis.json();
  assert(analysis.status === 200, `Demo AI вернул ${analysis.status}`);
  assert(analysisBody.source === "demo", "Без ключа ожидался demo AI");
  assert(Array.isArray(analysisBody.data?.recommendations), "Demo AI не вернул рекомендации");

  const missing = await fetch(`${origin}/missing-file`);
  assert(missing.status === 404, `Неизвестный файл вернул ${missing.status}`);

  const protectedEnv = await fetch(`${origin}/.env.local`);
  assert(protectedEnv.status === 404, `Секретный env-файл вернул ${protectedEnv.status}`);

  const protectedServer = await fetch(`${origin}/server.mjs`);
  assert(protectedServer.status === 404, `Серверный исходник вернул ${protectedServer.status}`);

  console.log("HTTP smoke: frontend, headers, health, validation, demo AI, protected files, 404 — пройдено");
} finally {
  server.kill("SIGTERM");
}
