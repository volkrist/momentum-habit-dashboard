import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const required = [
  "index.html",
  "assets/styles.css",
  "assets/favicon.svg",
  "src/app.mjs",
  "src/store.mjs",
  "src/analytics.mjs",
  "src/insights.mjs",
  "src/render.mjs",
  "api/insights.js",
  "server.mjs",
  "scripts/http-smoke.mjs",
  "START_HERE.txt",
  "README.md",
  "QA_REPORT.md",
  "PROMPTS.md",
  "SPEC.md",
  "docs/screenshots/dashboard-desktop.jpg",
  "docs/screenshots/ai-analysis-flow.jpg",
  ".env.example",
  ".gitignore",
  "vercel.json",
];

const failures = [];
for (const file of required) {
  if (!existsSync(join(root, file))) failures.push(`Нет файла: ${file}`);
}

function collectFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? collectFiles(path) : [path];
  });
}

for (const file of collectFiles(root)) {
  if (![".js", ".mjs"].includes(extname(file))) continue;
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`Синтаксис: ${file}\n${result.stderr}`);
}

const textFiles = collectFiles(root).filter((file) => ![".png", ".webp"].includes(extname(file)));
for (const file of textFiles) {
  const content = readFileSync(file, "utf8");
  if (/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/.test(content)) failures.push(`Возможный API-ключ в ${file}`);
}

if (existsSync(join(root, ".env.local"))) failures.push(".env.local не должен входить в готовый архив");
const gitignore = existsSync(join(root, ".gitignore")) ? readFileSync(join(root, ".gitignore"), "utf8") : "";
if (!gitignore.includes(".env.local")) failures.push(".gitignore не защищает .env.local");

const indexHtml = existsSync(join(root, "index.html")) ? readFileSync(join(root, "index.html"), "utf8") : "";
const htmlIds = [...indexHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index);
if (duplicateIds.length) failures.push(`Повторяющиеся HTML id: ${[...new Set(duplicateIds)].join(", ")}`);
const spriteIds = new Set([...indexHtml.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]));
const spriteUses = [...indexHtml.matchAll(/<use href="#([^"]+)"/g)].map((match) => match[1]);
const missingSpriteIds = spriteUses.filter((id) => !spriteIds.has(id));
if (missingSpriteIds.length) failures.push(`Не найдены SVG-symbol: ${[...new Set(missingSpriteIds)].join(", ")}`);

if (failures.length) {
  console.error(`Проверка не пройдена (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Проверка структуры и безопасности пройдена: ${required.length} обязательных файлов.`);
