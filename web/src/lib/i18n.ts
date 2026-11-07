import { createI18n } from "vue-i18n";
import en from "../locales/en";
import { serverErrors } from "../locales/server";
import sw from "../locales/sw";
import zh from "../locales/zh";

export const LOCALES = [
  { code: "en", label: "English", tag: "en-GB" },
  { code: "sw", label: "Kiswahili", tag: "sw-TZ" },
  { code: "zh", label: "中文", tag: "zh-CN" },
] as const;
export type Locale = (typeof LOCALES)[number]["code"];

const KEY = "legitify.locale";
const isLocale = (v: unknown): v is Locale => LOCALES.some((l) => l.code === v);

function initial(): Locale {
  const stored = localStorage.getItem(KEY);
  if (isLocale(stored)) return stored;
  return navigator.languages.map((l) => l.slice(0, 2)).find(isLocale) ?? "en";
}

export const i18n = createI18n({ legacy: false, locale: initial(), fallbackLocale: "en", messages: { en, sw, zh } });

/** Safe in scripts and templates alike: it reads the active locale, so computed text follows a switch. */
export const t = (key: string, params: Record<string, unknown> = {}) => i18n.global.t(key, params);
export const te = (key: string) => i18n.global.te(key);
export const currentLocale = () => i18n.global.locale.value as Locale;
export const dateLocale = () => LOCALES.find((l) => l.code === currentLocale())!.tag;

export function localizeServerError(message: string) {
  const locale = currentLocale();
  return locale === "en" ? message : serverErrors[message]?.[locale] ?? message;
}

function reflect(locale: Locale) {
  document.documentElement.lang = LOCALES.find((l) => l.code === locale)!.tag;
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.description"));
}
reflect(currentLocale());

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale;
  localStorage.setItem(KEY, locale);
  reflect(locale);
}
