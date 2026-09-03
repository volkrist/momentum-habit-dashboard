import { CATEGORY_META, formatShortDate, formatWeekday } from "./analytics.mjs";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function pluralDays(value) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "дня";
  return "дней";
}

function renderMetricValues(stats) {
  setText("overall-rate", `${stats.rate}%`);
  setText("current-streak", `${stats.currentStreak} ${pluralDays(stats.currentStreak)}`);
  setText("today-completed", stats.todayCompleted);
  setText("today-count-small", `${stats.todayCompleted} из ${stats.todayTotal}`);
  setText("best-streak", `${stats.bestStreak} ${pluralDays(stats.bestStreak)}`);
  setText("best-habit-name", stats.bestHabitName);
  setText("today-progress-value", `${stats.todayRate}%`);
  setText("hero-streak", `🔥 Серия: ${stats.currentStreak} ${pluralDays(stats.currentStreak)}`);
  setText("completion-badge", `${stats.todayCompleted} / ${stats.todayTotal} готово`);

  const deltaElement = document.getElementById("rate-delta");
  if (deltaElement) {
    const sign = stats.rateDelta > 0 ? "+" : "";
    deltaElement.textContent = `${sign}${stats.rateDelta}% к прошлому`;
    deltaElement.className = stats.rateDelta > 0 ? "is-positive" : stats.rateDelta < 0 ? "is-negative" : "";
  }

  setText(
    "streak-caption",
    stats.currentStreak > 0 ? "Продолжайте сегодня" : "Начните сегодня",
  );

  const ring = document.getElementById("today-progress-ring");
  if (ring) {
    const circumference = 2 * Math.PI * 61;
    ring.style.strokeDashoffset = String(circumference * (1 - stats.todayRate / 100));
  }

  const heroMessage = stats.todayTotal === 0
    ? "Добавьте первую привычку, чтобы начать отслеживать прогресс."
    : stats.todayRate === 100
      ? "План на сегодня выполнен. Отличный ритм — теперь просто удерживайте его."
      : `Выполнено ${stats.todayCompleted} из ${stats.todayTotal}. Осталось ${stats.todayTotal - stats.todayCompleted}.`;
  setText("hero-message", heroMessage);
}

function renderTrendChart(series) {
  const container = document.getElementById("trend-chart");
  if (!container) return;

  const width = 760;
  const height = 220;
  const padding = { top: 12, right: 18, bottom: 30, left: 34 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const safeSeries = series.length ? series : [{ key: "", label: "Нет данных", value: 0 }];
  const x = (index) => padding.left + (safeSeries.length === 1 ? chartWidth / 2 : (index / (safeSeries.length - 1)) * chartWidth);
  const y = (value) => padding.top + chartHeight - (value / 100) * chartHeight;
  const points = safeSeries.map((item, index) => `${x(index)},${y(item.value)}`).join(" ");
  const areaPoints = `${padding.left},${padding.top + chartHeight} ${points} ${x(safeSeries.length - 1)},${padding.top + chartHeight}`;
  const labelEvery = Math.max(1, Math.ceil(safeSeries.length / 6));

  const grid = [0, 25, 50, 75, 100].map((value) => `
    <line class="chart-grid-line" x1="${padding.left}" y1="${y(value)}" x2="${width - padding.right}" y2="${y(value)}" />
    <text class="chart-label" x="${padding.left - 8}" y="${y(value) + 3}" text-anchor="end">${value}</text>
  `).join("");
  const labels = safeSeries.map((item, index) => {
    const show = index === 0 || index === safeSeries.length - 1 || index % labelEvery === 0;
    return show ? `<text class="chart-label" x="${x(index)}" y="${height - 6}" text-anchor="middle">${escapeHtml(item.label)}</text>` : "";
  }).join("");
  const dots = safeSeries.map((item, index) => {
    const show = safeSeries.length <= 14 || index === safeSeries.length - 1;
    return show ? `<circle class="chart-point" cx="${x(index)}" cy="${y(item.value)}" r="3.6"><title>${escapeHtml(item.label)}: ${item.value}%</title></circle>` : "";
  }).join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Динамика выполнения привычек">
      <defs>
        <linearGradient id="chartAreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#36b66d" stop-opacity="0.24" />
          <stop offset="100%" stop-color="#36b66d" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${grid}
      <polygon class="chart-area" points="${areaPoints}" />
      <polyline class="chart-line" points="${points}" />
      ${dots}
      ${labels}
    </svg>
  `;
}

function renderCategoryChart(categoryTotals) {
  const donut = document.getElementById("category-donut");
  const legend = document.getElementById("category-legend");
  if (!donut || !legend) return;

  const total = categoryTotals.reduce((sum, item) => sum + item.value, 0);
  setText("donut-total", total);

  if (total === 0) {
    donut.style.background = "conic-gradient(var(--surface-muted) 0 100%)";
  } else {
    let offset = 0;
    const segments = categoryTotals.map((item) => {
      const start = offset;
      offset += (item.value / total) * 100;
      return `${item.color} ${start.toFixed(2)}% ${offset.toFixed(2)}%`;
    });
    donut.style.background = `conic-gradient(${segments.join(", ")})`;
  }

  legend.innerHTML = categoryTotals.map((item) => {
    const percent = total === 0 ? 0 : Math.round((item.value / total) * 100);
    return `<li><i style="background:${item.color}"></i><span>${item.label}</span><strong>${percent}%</strong></li>`;
  }).join("");
}

function renderWeekdays(weekKeys) {
  const row = document.getElementById("weekday-row");
  if (!row) return;
  row.innerHTML = `<span>Привычка</span>${weekKeys.map((key) => `<span title="${formatShortDate(key)}">${formatWeekday(key)}</span>`).join("")}<span></span>`;
}

function renderHabits(stats) {
  const list = document.getElementById("habit-list");
  const empty = document.getElementById("empty-state");
  if (!list || !empty) return;

  const habits = stats.selectedHabits;
  empty.hidden = habits.length > 0;
  list.hidden = habits.length === 0;

  const perHabit = new Map(stats.perHabit.map((item) => [item.id, item]));
  list.innerHTML = habits.map((habit) => {
    const itemStats = perHabit.get(habit.id);
    const checks = stats.weekKeys.map((key) => {
      const done = Boolean(habit.entries?.[key]);
      const today = key === stats.todayKey;
      const label = `${habit.name}, ${formatShortDate(key)}: ${done ? "выполнено" : "не выполнено"}`;
      return `<button
        type="button"
        class="day-check${done ? " is-done" : ""}${today ? " is-today" : ""}"
        data-action="toggle-entry"
        data-habit-id="${escapeHtml(habit.id)}"
        data-date-key="${key}"
        aria-label="${escapeHtml(label)}"
        aria-pressed="${done}"
        style="--habit-color:${habit.color}"
      ><svg aria-hidden="true"><use href="#icon-check" /></svg></button>`;
    }).join("");

    return `<article class="habit-row" style="--habit-color:${habit.color};--habit-soft:${habit.soft}">
      <div class="habit-meta">
        <span class="habit-emoji" aria-hidden="true">${escapeHtml(habit.emoji)}</span>
        <span class="habit-copy">
          <strong>${escapeHtml(habit.name)}</strong>
          <small>${CATEGORY_META[habit.category].label} · ${itemStats.completedThisWeek}/${habit.targetPerWeek} за неделю</small>
        </span>
      </div>
      ${checks}
      <button class="edit-habit" type="button" data-action="edit-habit" data-habit-id="${escapeHtml(habit.id)}" aria-label="Изменить привычку ${escapeHtml(habit.name)}">
        <svg aria-hidden="true"><use href="#icon-edit" /></svg>
      </button>
    </article>`;
  }).join("");
}

function renderHeatmap(stats) {
  const heatmap = document.getElementById("heatmap");
  if (!heatmap) return;
  heatmap.innerHTML = stats.heatmap.map((day) => {
    const tooltip = `${formatShortDate(day.key)}: ${day.value} ${day.value === 1 ? "отметка" : "отметок"}`;
    return `<span class="heatmap-cell" data-level="${day.level}" data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}"></span>`;
  }).join("");
}

export function renderInsights(insights) {
  const score = document.getElementById("ai-score");
  const recommendations = document.getElementById("recommendation-list");
  const mode = document.getElementById("ai-mode");
  if (!score || !recommendations || !mode) return;

  if (!insights) {
    score.hidden = true;
    recommendations.innerHTML = "";
    mode.textContent = "ДЕМО";
    mode.classList.remove("is-live");
    return;
  }

  setText("ai-summary", insights.summary);
  setText("ai-score-value", insights.score);
  const trendLabels = { up: "Ритм растёт", stable: "Стабильный ритм", down: "Ритм снижается" };
  setText("ai-trend-label", trendLabels[insights.trend] || trendLabels.stable);
  score.hidden = false;
  mode.textContent = insights.source === "openai" ? "OPENAI" : "ДЕМО";
  mode.classList.toggle("is-live", insights.source === "openai");

  recommendations.innerHTML = (insights.recommendations || []).map((item, index) => `
    <li>
      <i>${index + 1}</i>
      <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.action)}</span></div>
    </li>
  `).join("");
}

export function renderDashboard(state, stats) {
  document.documentElement.dataset.theme = state.settings.theme;
  setText("habit-count", state.habits.length);
  renderMetricValues(stats);
  renderTrendChart(stats.dailySeries);
  renderCategoryChart(stats.categoryTotals);
  renderWeekdays(stats.weekKeys);
  renderHabits(stats);
  renderHeatmap(stats);
  renderInsights(state.insights);

  document.querySelectorAll("[data-range]").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.range) === state.settings.range);
  });
  const categorySelect = document.getElementById("category-select");
  if (categorySelect) categorySelect.value = state.settings.category;
}
