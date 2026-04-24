import { describe, expect, it } from "vitest";
import { normalizeSearchText, normalizedIncludes } from "../searchUtils";

describe("searchUtils", () => {
  it("normalizes е and ё equally", () => {
    expect(normalizeSearchText("Ёлка")).toBe("елка");
    expect(normalizedIncludes("Елка", "Ёл")).toBe(true);
    expect(normalizedIncludes("Ёлка", "Ел")).toBe(true);
  });

  it("supports client search cleanup options", () => {
    expect(
      normalizeSearchText('ООО "Ёжик"', {
        stripQuotes: true,
        stripLegalForms: true,
      })
    ).toBe("ежик");
  });
});
