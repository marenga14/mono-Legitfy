import { allCountries } from "country-region-data";

/** The current 31 regions. The dataset still has the 26 from before 2016 and older Zanzibar names. */
const TANZANIA = [
  "Arusha", "Dar es Salaam", "Dodoma", "Geita", "Iringa", "Kagera", "Kaskazini Pemba", "Kaskazini Unguja", "Katavi", "Kigoma",
  "Kilimanjaro", "Kusini Pemba", "Kusini Unguja", "Lindi", "Manyara", "Mara", "Mbeya", "Mjini Magharibi", "Morogoro", "Mtwara",
  "Mwanza", "Njombe", "Pwani", "Rukwa", "Ruvuma", "Shinyanga", "Simiyu", "Singida", "Songwe", "Tabora", "Tanga",
];

const nameIn = (locale: string, code: string, fallback: string) => {
  const name = new Intl.DisplayNames([locale], { type: "region", fallback: "none" }).of(code);
  return name ?? fallback;
};

/** Saved in English whatever the page language, so the same country is never stored two ways. */
const places = allCountries.map(([dataName, code, regions]) => ({
  code,
  value: nameIn("en", code, dataName),
  regions: code === "TZ" ? TANZANIA : regions.map(([name]) => name),
}));

export const DEFAULT_COUNTRY = "Tanzania";

export const countriesFor = (locale: string) =>
  places
    .map((p) => ({ value: p.value, label: nameIn(locale, p.code, p.value) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));

export const regionsOf = (country: string) => places.find((p) => p.value === country)?.regions ?? [];
