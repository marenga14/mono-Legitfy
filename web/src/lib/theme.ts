import { ref } from "vue";

export type Theme = "light" | "dark";
const KEY = "legitify.theme";

function saved(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

/** One choice for the whole product, dark until someone picks otherwise. */
export const theme = ref<Theme>("light");

export function applyTheme() {
  theme.value = saved() ?? "light";
  document.documentElement.dataset.theme = theme.value;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.value === "dark" ? "#0a0930" : "#f5f4fd");
}

export function toggleTheme() {
  const next: Theme = theme.value === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Private windows can refuse storage. The switch still works until the page reloads.
  }
  theme.value = next;
  document.documentElement.dataset.theme = next;
}
