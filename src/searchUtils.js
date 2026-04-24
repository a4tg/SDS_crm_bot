export function normalizeSearchText(value, options = {}) {
  const {
    stripQuotes = false,
    stripLegalForms = false,
    collapseWhitespace = true,
  } = options;

  let normalized = String(value || "")
    .toLowerCase()
    .replace(/\u0451/g, "\u0435");

  if (stripQuotes) {
    normalized = normalized.replace(/[\u00ab\u00bb"'`\u201c\u201d\u201e]/g, " ");
  }

  if (stripLegalForms) {
    normalized = normalized.replace(
      /(^|\s)(\u043e\u043e\u043e|\u0430\u043e|\u043f\u0430\u043e|\u0437\u0430\u043e|\u043e\u0430\u043e|\u0438\u043f)(?=\s|$)/g,
      " "
    );
  }

  if (collapseWhitespace) {
    normalized = normalized.replace(/\s+/g, " ").trim();
  }

  return normalized;
}

export function normalizedIncludes(haystack, needle, options) {
  const normalizedNeedle = normalizeSearchText(needle, options);
  if (!normalizedNeedle) return true;
  return normalizeSearchText(haystack, options).includes(normalizedNeedle);
}
