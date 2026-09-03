import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const runtimeModules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
    if (!runtimeModules) throw new Error("Playwright не установлен");
    return import(pathToFileURL(join(runtimeModules, "playwright", "index.mjs")).href);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function preparePage(browser, viewport) {
  const context = await browser.newContext({
    viewport,
    locale: "ru-RU",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return { context, page, errors };
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const screenshotDir = resolve("docs/screenshots");
await mkdir(screenshotDir, { recursive: true });

try {
  const desktop = await preparePage(browser, { width: 1440, height: 1000 });
  await desktop.page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
  await desktop.page.evaluate(() => localStorage.clear());
  await desktop.page.reload({ waitUntil: "networkidle" });

  assert((await desktop.page.locator(".habit-row").count()) === 6, "На старте должно быть 6 демо-привычек");
  assert(await desktop.page.locator("#overall-rate").isVisible(), "KPI выполнения не виден");
  await desktop.page.screenshot({ path: join(screenshotDir, "dashboard-desktop.png"), fullPage: true });

  await desktop.page.click("#add-habit-button");
  assert(await desktop.page.locator("#habit-dialog").evaluate((dialog) => dialog.open), "Форма привычки не открылась");
  await desktop.page.screenshot({ path: join(screenshotDir, "habit-dialog.png") });
  await desktop.page.fill("#habit-name", "Практика английского");
  await desktop.page.selectOption("#habit-category", "growth");
  await desktop.page.selectOption("#habit-target", "4");
  await desktop.page.click('#habit-form button[type="submit"]');
  await desktop.page.waitForSelector("text=Практика английского");
  assert((await desktop.page.locator(".habit-row").count()) === 7, "Новая привычка не добавилась");

  const beforeToggle = await desktop.page.textContent("#today-completed");
  await desktop.page.locator(".day-check.is-today:not(.is-done)").first().click();
  const afterToggle = await desktop.page.textContent("#today-completed");
  assert(beforeToggle !== afterToggle, "Отметка дня не обновила KPI");

  await desktop.page.reload({ waitUntil: "networkidle" });
  assert(await desktop.page.getByText("Практика английского", { exact: true }).isVisible(), "localStorage не пережил перезагрузку");

  await desktop.page.click('[data-range="30"]');
  assert(await desktop.page.locator('[data-range="30"]').evaluate((node) => node.classList.contains("is-active")), "Фильтр периода не применился");
  await desktop.page.selectOption("#category-select", "growth");
  assert((await desktop.page.locator(".habit-row").count()) >= 2, "Фильтр категории дал неверный список");
  await desktop.page.selectOption("#category-select", "all");

  await desktop.page.click("#generate-insights-button");
  await desktop.page.waitForFunction(() => !document.getElementById("ai-score").hidden);
  assert((await desktop.page.textContent("#ai-mode")) === "ДЕМО", "Без ключа должен работать demo AI");
  assert((await desktop.page.locator("#recommendation-list li").count()) > 0, "AI-рекомендации не отрисовались");
  await desktop.page.screenshot({ path: join(screenshotDir, "dashboard-ai-analysis.png"), fullPage: true });

  await desktop.page.click("#theme-toggle");
  assert((await desktop.page.getAttribute("html", "data-theme")) === "dark", "Тёмная тема не включилась");
  assert(desktop.errors.length === 0, `Ошибки desktop-консоли:\n${desktop.errors.join("\n")}`);
  await desktop.context.close();

  const mobile = await preparePage(browser, { width: 390, height: 844 });
  await mobile.page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
  await mobile.page.evaluate(() => localStorage.clear());
  await mobile.page.reload({ waitUntil: "networkidle" });
  const widths = await mobile.page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert(widths.document <= widths.viewport + 1, `Mobile overflow: ${widths.document}px > ${widths.viewport}px`);
  assert(await mobile.page.locator(".sidebar").isVisible(), "Мобильная навигация не видна");
  assert(await mobile.page.locator("#add-habit-button").isVisible(), "Мобильная кнопка добавления не видна");
  await mobile.page.screenshot({ path: join(screenshotDir, "dashboard-mobile.png"), fullPage: true });
  assert(mobile.errors.length === 0, `Ошибки mobile-консоли:\n${mobile.errors.join("\n")}`);
  await mobile.context.close();

  console.log("Browser QA: desktop + mobile — пройдено");
  console.log("Сценарии: render, add, toggle, persist, filters, demo AI, theme, overflow, console");
} finally {
  await browser.close();
}
