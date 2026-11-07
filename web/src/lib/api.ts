import { reactive } from "vue";
import { apiUrl } from "./config";
import { localizeServerError, t } from "./i18n";

export type Role = "platform" | "admin" | "operator";
export interface Session { token: string; role: Role; account: string; owner: string; mode: "eoa" | "smart"; institutionId?: number }

const KEY = "legitify.session";
function restore(): Session | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}
export const session = reactive<{ current: Session | null }>({ current: restore() });

export function setSession(next: Session | null) {
  session.current = next;
  if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
  else sessionStorage.removeItem(KEY);
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (session.current) headers.set("authorization", `Bearer ${session.current.token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(t("errors.offline"), 0);
  }
  if (res.status === 401) setSession(null);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error ? localizeServerError(body.error) : t("errors.requestFailed", { status: res.status }), res.status);
  }
  return (res.headers.get("content-type")?.includes("json") ? res.json() : res.blob()) as Promise<T>;
}
