type SearchParams = Record<string, string | string[] | undefined>;

export const yearOptions = [
  { value: "any", label: "Any year" },
  { value: "1800-1899", label: "1800–1899" },
  { value: "1900-1999", label: "1900–1999" },
  { value: "2000-present", label: "2000–present" },
];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function readSearchParams(params: SearchParams) {
  const year = first(params.year);
  return {
    query: first(params.query).slice(0, 160).trim(),
    section: first(params.section) || "all",
    year: yearOptions.some(option => option.value === year) ? year : "any",
    sort: first(params.sort) === "newest" ? "newest" as const : "name" as const,
    page: Math.max(1, Math.min(10000, Number.parseInt(first(params.page), 10) || 1)),
  };
}

export type MemorialSearchState = ReturnType<typeof readSearchParams>;

export function resultsHref(state: MemorialSearchState, changes: Partial<MemorialSearchState> = {}) {
  const { query, section, year, sort, page } = { ...state, ...changes };
  return "/results?" + new URLSearchParams({ query, section, year, sort, page: String(page) });
}
