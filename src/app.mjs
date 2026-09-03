import { calculateDashboardStats, CATEGORY_META } from "./analytics.mjs";
import { buildInsightsPayload, requestInsights } from "./insights.mjs";
import { renderDashboard } from "./render.mjs";
import { createHabitStore } from "./store.mjs";

const store = createHabitStore(window.localStorage);
const dialog = document.getElementById("habit-dialog");
const form = document.getElementById("habit-form");
const generateButton = document.getElementById("generate-insights-button");
let currentStats = null;

function getStats(state = store.getState()) {
  return calculateDashboardStats(state.habits, {
    days: state.settings.range,
    category: state.settings.category,
  });
}

function refresh(state = store.getState(), saveSucceeded = true) {
  currentStats = getStats(state);
  renderDashboard(state, currentStats);
  const status = document.getElementById("save-status");
  if (status) {
    status.lastChild.textContent = saveSucceeded ? " Сохранено локально" : " Не удалось сохранить";
  }
}

function showToast(title, message, type = "success") {
  const region = document.getElementById("toast-region");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<i>${type === "success" ? "✓" : "!"}</i><div><strong></strong><span></span></div>`;
  toast.querySelector("strong").textContent = title;
  toast.querySelector("span").textContent = message;
  region.append(toast);
  setTimeout(() => {
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}

function setGreeting() {
  const hour = new Date().getHours();
  const greeting = hour < 6 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const heading = document.querySelector(".title-block h1");
  if (heading) heading.innerHTML = `${greeting}, Алекс <span aria-hidden="true">👋</span>`;
  const todayLabel = document.getElementById("today-label");
  if (todayLabel) {
    todayLabel.textContent = new Intl.DateTimeFormat("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
  }
}

function openHabitDialog(habit = null) {
  form.reset();
  document.getElementById("habit-id").value = habit?.id || "";
  document.getElementById("habit-dialog-title").textContent = habit ? "Изменить привычку" : "Новая привычка";
  document.getElementById("delete-habit-button").hidden = !habit;

  if (habit) {
    document.getElementById("habit-name").value = habit.name;
    document.getElementById("habit-category").value = habit.category;
    document.getElementById("habit-target").value = String(habit.targetPerWeek);
    const emojiInput = form.querySelector(`input[name="emoji"][value="${CSS.escape(habit.emoji)}"]`);
    if (emojiInput) emojiInput.checked = true;
  }

  dialog.showModal();
  requestAnimationFrame(() => document.getElementById("habit-name").focus());
}

function closeHabitDialog() {
  if (dialog.open) dialog.close();
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.scroll === id);
  });
}

store.subscribe(refresh);
setGreeting();
refresh();

document.getElementById("range-filter")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-range]");
  if (!button) return;
  store.setSettings({ range: Number(button.dataset.range) });
});

document.getElementById("category-select")?.addEventListener("change", (event) => {
  store.setSettings({ category: event.target.value });
});

document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.addEventListener("click", () => scrollToSection(button.dataset.scroll));
});

document.getElementById("add-habit-button")?.addEventListener("click", () => openHabitDialog());

document.addEventListener("click", (event) => {
  const addButton = event.target.closest('[data-action="add-habit"]');
  if (addButton) openHabitDialog();

  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) closeHabitDialog();
});

document.getElementById("habit-list")?.addEventListener("click", (event) => {
  const toggle = event.target.closest('[data-action="toggle-entry"]');
  if (toggle) {
    store.toggleEntry(toggle.dataset.habitId, toggle.dataset.dateKey);
    const state = store.getState();
    const stats = getStats(state);
    if (toggle.dataset.dateKey === stats.todayKey && stats.todayRate === 100) {
      showToast("День закрыт", "Все привычки на сегодня выполнены.");
    }
    return;
  }

  const edit = event.target.closest('[data-action="edit-habit"]');
  if (edit) {
    const habit = store.getState().habits.find((item) => item.id === edit.dataset.habitId);
    if (habit) openHabitDialog(habit);
  }
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  if (!name) {
    document.getElementById("habit-name").focus();
    return;
  }

  const input = {
    name,
    category: String(data.get("category")),
    targetPerWeek: Number(data.get("targetPerWeek")),
    emoji: String(data.get("emoji") || "🎯"),
  };
  const id = String(data.get("habitId") || "");

  try {
    if (id) {
      store.updateHabit(id, input);
      showToast("Привычка обновлена", "Изменения сохранены локально.");
    } else {
      store.addHabit(input);
      showToast("Привычка добавлена", "Она уже появилась в плане на сегодня.");
    }
    closeHabitDialog();
  } catch (error) {
    showToast("Не удалось сохранить", error.message, "error");
  }
});

document.getElementById("delete-habit-button")?.addEventListener("click", () => {
  const id = document.getElementById("habit-id").value;
  const habit = store.getState().habits.find((item) => item.id === id);
  if (!habit) return;
  if (window.confirm(`Удалить привычку «${habit.name}» и всю её историю?`)) {
    store.removeHabit(id);
    closeHabitDialog();
    showToast("Привычка удалена", "История этой привычки очищена.");
  }
});

document.getElementById("theme-toggle")?.addEventListener("click", () => {
  const theme = store.getState().settings.theme === "dark" ? "light" : "dark";
  store.setSettings({ theme });
});

document.getElementById("reset-menu-button")?.addEventListener("click", () => {
  if (window.confirm("Вернуть исходные демонстрационные данные?")) {
    store.reset();
    showToast("Демо восстановлено", "Dashboard возвращён в исходное состояние.");
  }
});

generateButton?.addEventListener("click", async () => {
  if (!currentStats || currentStats.selectedHabits.length === 0) {
    showToast("Недостаточно данных", "Сначала добавьте хотя бы одну привычку.", "error");
    return;
  }

  generateButton.disabled = true;
  generateButton.classList.add("is-loading");
  generateButton.querySelector("span").textContent = "Анализирую…";

  const result = await requestInsights(buildInsightsPayload(currentStats));
  store.setInsights(result);

  const isLive = result.source === "openai";
  showToast(
    isLive ? "AI-анализ готов" : "Демо-анализ готов",
    isLive ? "Рекомендации получены через OpenAI." : "После добавления ключа здесь будет анализ OpenAI.",
  );

  generateButton.disabled = false;
  generateButton.classList.remove("is-loading");
  generateButton.querySelector("span").textContent = "Обновить анализ";
});

document.getElementById("export-button")?.addEventListener("click", () => {
  const blob = new Blob([store.exportData()], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `momentum-export-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Экспорт готов", "JSON-файл сохранён на устройство.");
});

window.addEventListener("storage", (event) => {
  if (event.key === "momentum.habits.v1") window.location.reload();
});

if (!Object.keys(CATEGORY_META).length) {
  showToast("Ошибка конфигурации", "Категории привычек не загрузились.", "error");
}
