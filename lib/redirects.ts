export const REDIRECTS_ITEM_KEY = "redirects";

export type RedirectRule = {
  destination: string;
  status: number;
};

export type RedirectMap = Record<string, RedirectRule>;

export function isRedirectRule(value: unknown): value is RedirectRule {
  if (!value || typeof value !== "object") return false;
  const rule = value as RedirectRule;
  return (
    typeof rule.destination === "string" &&
    rule.destination.length > 0 &&
    typeof rule.status === "number" &&
    rule.status >= 300 &&
    rule.status < 400
  );
}

/** Aligns with src/lib/redirects/global-config-redirects.ts */
export function parseRedirectsValue(value: unknown): RedirectMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const map: RedirectMap = {};
  for (const [source, rule] of Object.entries(value)) {
    if (!source.startsWith("/")) continue;
    if (!isRedirectRule(rule)) continue;
    map[source] = rule;
  }
  return map;
}

export function normalizeSourcePath(source: string): string {
  const trimmed = source.trim();
  if (!trimmed.startsWith("/")) {
    return `/${trimmed.replace(/^\/+/, "")}`;
  }
  return trimmed;
}

export function validateRedirectInput(
  source: string,
  destination: string,
  status: number,
): string | null {
  const normalizedSource = normalizeSourcePath(source);
  if (!normalizedSource.startsWith("/") || normalizedSource === "/") {
    return "Source path must start with / (e.g. /old-path)";
  }
  if (!destination.trim()) {
    return "Destination is required";
  }
  if (!Number.isInteger(status) || status < 300 || status >= 400) {
    return "Status must be an HTTP redirect code between 300 and 399";
  }
  return null;
}

export type RedirectRowData = {
  source: string;
  destination: string;
  status: number;
};

/** Finds a row with the same source path, destination, and status. */
export function findDuplicateRedirect(
  rows: RedirectRowData[],
  source: string,
  destination: string,
  status: number,
): RedirectRowData | undefined {
  const normalizedSource = normalizeSourcePath(source);
  const normalizedDestination = destination.trim();

  return rows.find(
    (row) =>
      normalizeSourcePath(row.source) === normalizedSource &&
      row.destination.trim() === normalizedDestination &&
      row.status === status,
  );
}

export function redirectMapToRows(map: RedirectMap): Array<{
  source: string;
  destination: string;
  status: number;
}> {
  return Object.entries(map)
    .map(([source, rule]) => ({
      source,
      destination: rule.destination,
      status: rule.status,
    }))
    .sort((a, b) => a.source.localeCompare(b.source));
}
