const key = "gitrecord-weekly-goals";

function savedGoals(): Record<string, number> {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!value || Array.isArray(value) || typeof value !== "object") return {};
    return Object.fromEntries(Object.entries(value).filter(([scope, goal]) => scope.length < 200 &&
      typeof goal === "number" && Number.isInteger(goal) && goal >= 1 && goal <= 7)) as Record<string, number>;
  } catch { return {}; }
}

export function readGoals() { return savedGoals(); }

export function saveGoals(goals: Record<string, number>) {
  try { localStorage.setItem(key, JSON.stringify(goals)); return true; }
  catch { return false; }
}
