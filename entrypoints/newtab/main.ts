import { localStorageArea } from "../../src/core/storage-utils";
import { addGoal, listGoals, removeGoal, toggleGoal } from "../../src/core/goals-store";
import { addLink, listLinks, removeLink } from "../../src/core/quick-links";

/**
 * OneKit home — the new-tab dashboard. Daily goals and quick links, both
 * stored in chrome.storage.local. Everything stays on this device; the
 * only pages it touches are the links you add.
 */

const storage = localStorageArea();

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};

/* Greeting + date ----------------------------------------------------- */

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function renderDate(): void {
  const now = new Date();
  $("greeting").textContent = `${greeting()} 👋`;
  $("date").textContent = now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

/* Daily goals --------------------------------------------------------- */

const goalInput = $("goal-input") as HTMLInputElement;

async function renderGoals(): Promise<void> {
  const goals = await listGoals(storage);
  const list = $("goal-list");
  list.innerHTML = "";
  if (goals.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No goals yet — add your top three for today.";
    list.appendChild(empty);
    return;
  }
  for (const goal of goals) {
    const li = document.createElement("li");
    li.className = goal.done ? "done" : "";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = goal.done;
    check.addEventListener("change", () => {
      void toggleGoal(goal.id, storage).then(() => void renderGoals());
    });
    const label = document.createElement("label");
    label.textContent = goal.text;
    const remove = document.createElement("button");
    remove.className = "x";
    remove.textContent = "✕";
    remove.title = "Remove";
    remove.addEventListener("click", () => {
      void removeGoal(goal.id, storage).then(() => void renderGoals());
    });
    li.append(check, label, remove);
    list.appendChild(li);
  }
}

$("goal-add").addEventListener("click", () => {
  void (async () => {
    await addGoal(goalInput.value, storage);
    goalInput.value = "";
    await renderGoals();
  })();
});
goalInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    void (async () => {
      await addGoal(goalInput.value, storage);
      goalInput.value = "";
      await renderGoals();
    })();
  }
});

/* Quick links --------------------------------------------------------- */

const linkLabel = $("link-label") as HTMLInputElement;
const linkUrl = $("link-url") as HTMLInputElement;
const linkStatus = $("link-status");

async function renderLinks(): Promise<void> {
  const links = await listLinks(storage);
  const list = $("link-list");
  list.innerHTML = "";
  for (const link of links) {
    const a = document.createElement("a");
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = link.label;
    const remove = document.createElement("span");
    remove.className = "remove";
    remove.textContent = "✕";
    remove.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void removeLink(link.id, storage).then(() => void renderLinks());
    });
    a.appendChild(remove);
    list.appendChild(a);
  }
}

$("link-add").addEventListener("click", () => {
  void (async () => {
    try {
      await addLink(linkLabel.value, linkUrl.value, storage);
      linkLabel.value = "";
      linkUrl.value = "";
      linkStatus.textContent = "";
      await renderLinks();
    } catch (err) {
      linkStatus.textContent = err instanceof Error ? err.message : String(err);
    }
  })();
});

void renderDate();
void renderGoals();
void renderLinks();
