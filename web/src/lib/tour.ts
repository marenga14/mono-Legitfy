import { session } from "./api";

/** Per browser, per account: a convenience, so losing it only means seeing the tour again. */
const key = () => `legitify.toured.${session.current?.account.toLowerCase()}`;

export function hasSeenTour() {
  try {
    return localStorage.getItem(key()) === "1";
  } catch {
    return true;
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(key(), "1");
  } catch {
    // Storage is blocked; the tour stays one click away in the menu.
  }
}
