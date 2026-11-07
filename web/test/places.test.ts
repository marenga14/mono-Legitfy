import { describe, expect, it } from "vitest";
import { DEFAULT_COUNTRY, countriesFor, regionsOf } from "../src/lib/places";

describe("places", () => {
  it("lists every country once, under the name the API stores", () => {
    const countries = countriesFor("en");
    expect(countries.length).toBeGreaterThan(240);
    expect(new Set(countries.map((c) => c.value)).size).toBe(countries.length);
    expect(countries.map((c) => c.value)).toContain(DEFAULT_COUNTRY);
  });

  it("keeps the stored value in English when the page is translated", () => {
    expect(countriesFor("zh").find((c) => c.value === "Tanzania")?.label).toBe("坦桑尼亚");
  });

  it("uses Tanzania's current 31 regions", () => {
    const regions = regionsOf("Tanzania");
    expect(regions).toHaveLength(31);
    expect(regions).toEqual(expect.arrayContaining(["Dar es Salaam", "Pwani", "Songwe", "Mjini Magharibi"]));
  });

  it("gives every region a name the API accepts", () => {
    for (const c of countriesFor("en")) {
      for (const region of regionsOf(c.value)) expect(region.length, `${c.value}: ${region}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("returns no regions for a country saved as free text", () => {
    expect(regionsOf("Somewhere else")).toEqual([]);
  });
});
