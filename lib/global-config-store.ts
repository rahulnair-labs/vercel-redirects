import {
  createClient,
  parseConnectionString,
} from "@vercel/global-config";
import {
  getGlobalConfigRedirectConnectionEnvKeys,
  getGlobalConfigRedirectConnectionEnvKeysLabel,
} from "@/lib/global-config-redirect-env-keys";
import {
  parseRedirectsValue,
  REDIRECTS_ITEM_KEY,
  type RedirectMap,
} from "@/lib/redirects";


/** @see https://vercel.com/docs/global-config/vercel-api */
const VERCEL_GLOBAL_CONFIG_API = "https://api.vercel.com/v1/global-config";

type PatchOperation = "create" | "update" | "upsert";

export type GlobalConfigSummary = {
  id: string;
  slug: string;
  digest: string;
  itemCount: number;
  updatedAt: number;
};

function getConnectionStringForEnvKey(envKey: string): string | undefined {
  return process.env[envKey]?.trim() || undefined;
}

export function getConnectionStrings(): {
  envKey: string;
  connectionString: string;
}[] {
  return getGlobalConfigRedirectConnectionEnvKeys().flatMap((envKey) => {
    const connectionString = getConnectionStringForEnvKey(envKey);
    return connectionString ? [{ envKey, connectionString }] : [];
  });
}

/** First configured connection string (_1, then _2, …). */
export function getConnectionString(): string | undefined {
  return getConnectionStrings()[0]?.connectionString;
}

export function getConnectionStringForConfigId(
  globalConfigId: string,
): string | undefined {
  for (const { connectionString } of getConnectionStrings()) {
    const connection = parseConnectionString(connectionString);
    if (connection?.id === globalConfigId) {
      return connectionString;
    }
  }
  return undefined;
}

export function isVercelApiConfigured(): boolean {
  return Boolean(process.env.VERCEL_API_TOKEN?.trim());
}

/** @deprecated Use isVercelApiConfigured or canReadGlobalConfig */
export function isStoreConfigured(): boolean {
  return isVercelApiConfigured() || Boolean(getConnectionString());
}

export function getDefaultGlobalConfigId(): string | null {
  const override = process.env.GLOBAL_CONFIG_ID?.trim();
  if (override) return override;

  for (const envKey of [...getGlobalConfigRedirectConnectionEnvKeys()].reverse()) {
    const connectionString = getConnectionStringForEnvKey(envKey);
    if (!connectionString) continue;
    const connection = parseConnectionString(connectionString);
    if (connection?.id) return connection.id;
  }
  return null;
}

export function canReadGlobalConfig(globalConfigId: string): boolean {
  if (!globalConfigId) return false;
  if (isVercelApiConfigured()) return true;
  return Boolean(getConnectionStringForConfigId(globalConfigId));
}

export function canWriteGlobalConfig(): boolean {
  return isVercelApiConfigured();
}

function getVercelApiToken(): string {
  const apiToken = process.env.VERCEL_API_TOKEN?.trim();
  if (!apiToken) {
    throw new Error(
      "VERCEL_API_TOKEN is required for this operation (server-only)",
    );
  }
  return apiToken;
}

function vercelApiUrl(path: string): URL {
  const url = new URL(`${VERCEL_GLOBAL_CONFIG_API}${path}`);
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }
  return url;
}

function resolveGlobalConfigIdFromEnv(): string {
  const id = getDefaultGlobalConfigId();
  if (!id) {
    throw new Error(
      `Set ${getGlobalConfigRedirectConnectionEnvKeysLabel()}, GLOBAL_CONFIG_ID, or pass globalConfigId`,
    );
  }
  return id;
}

function createReadClientForConfigId(globalConfigId: string) {
  const connectionString = getConnectionStringForConfigId(globalConfigId);
  if (!connectionString) {
    throw new Error(
      `No connection string for Global Config ${globalConfigId}. Set ${getGlobalConfigRedirectConnectionEnvKeysLabel()}.`,
    );
  }
  return createClient(connectionString);
}

function isNotFoundError(responseBody: string): boolean {
  return (
    responseBody.includes('"code":"not_found"') ||
    responseBody.includes("not_found") ||
    responseBody.toLowerCase().includes("not found")
  );
}

function parseGlobalConfigListPayload(body: string): GlobalConfigSummary[] {
  const parsed = JSON.parse(body) as
    | Array<{
        id: string;
        slug: string;
        digest: string;
        itemCount: number;
        updatedAt: number;
      }>
    | {
        configs?: Array<{
          id: string;
          slug: string;
          digest: string;
          itemCount: number;
          updatedAt: number;
        }>;
      };

  const list = Array.isArray(parsed) ? parsed : parsed.configs ?? [];

  return list.map((item) => ({
    id: item.id,
    slug: item.slug,
    digest: item.digest,
    itemCount: item.itemCount,
    updatedAt: item.updatedAt,
  }));
}

function parseItemsPayload(body: string): Record<string, unknown> {
  const parsed = JSON.parse(body) as
    | Record<string, unknown>
    | { items?: Record<string, unknown> };

  if (parsed && typeof parsed === "object" && "items" in parsed) {
    const items = (parsed as { items?: Record<string, unknown> }).items;
    if (items && typeof items === "object" && !Array.isArray(items)) {
      return items;
    }
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }

  return {};
}

export async function listGlobalConfigs(): Promise<GlobalConfigSummary[]> {
  const response = await fetch(vercelApiUrl(""), {
    headers: { Authorization: `Bearer ${getVercelApiToken()}` },
    cache: "no-store",
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Failed to list Global Configs (${response.status}): ${body}`,
    );
  }

  return parseGlobalConfigListPayload(body);
}

/** Dropdown entries for configured `GLOBAL_CONFIG_REDIRECTS_*` env vars. */
export function getProfileGlobalConfigsFromEnv(): GlobalConfigSummary[] {
  return getConnectionStrings().flatMap(({ envKey, connectionString }) => {
    const connection = parseConnectionString(connectionString);
    const id = connection?.id;
    if (!id) return [];
    return [
      {
        id,
        slug: envKey,
        digest: "",
        itemCount: 0,
        updatedAt: 0,
      },
    ];
  });
}

/** Env-configured shards for the dashboard; enriches from Vercel API when available. */
export async function listProfileGlobalConfigs(): Promise<GlobalConfigSummary[]> {
  const fromEnv = getProfileGlobalConfigsFromEnv();
  if (fromEnv.length === 0) return [];

  if (!isVercelApiConfigured()) {
    return fromEnv;
  }

  try {
    const apiConfigs = await listGlobalConfigs();
    return fromEnv.map((entry) => {
      const match = apiConfigs.find((c) => c.id === entry.id);
      return match ? { ...match, slug: entry.slug } : entry;
    });
  } catch {
    return fromEnv;
  }
}

async function fetchGlobalConfigDigest(
  globalConfigId: string,
): Promise<string> {
  try {
    const response = await fetch(vercelApiUrl(`/${globalConfigId}`), {
      headers: { Authorization: `Bearer ${getVercelApiToken()}` },
      cache: "no-store",
    });
    const body = await response.text();
    if (!response.ok) return "";
    const meta = JSON.parse(body) as { digest?: string };
    return meta.digest ?? "";
  } catch {
    return "";
  }
}

async function readRedirectMapViaApi(
  globalConfigId: string,
): Promise<{ map: RedirectMap; digest: string }> {
  const response = await fetch(vercelApiUrl(`/${globalConfigId}/items`), {
    headers: { Authorization: `Bearer ${getVercelApiToken()}` },
    cache: "no-store",
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Failed to read Global Config items (${response.status}): ${body}`,
    );
  }

  const items = parseItemsPayload(body);
  const digest = await fetchGlobalConfigDigest(globalConfigId);
  return {
    map: parseRedirectsValue(items[REDIRECTS_ITEM_KEY]),
    digest,
  };
}

async function readRedirectMapViaSdk(
  globalConfigId: string,
): Promise<{
  map: RedirectMap;
  digest: string;
}> {
  const client = createReadClientForConfigId(globalConfigId);
  const [raw, digest] = await Promise.all([
    client.get(REDIRECTS_ITEM_KEY, { consistentRead: true }),
    client.digest({ consistentRead: true }),
  ]);
  return {
    map: parseRedirectsValue(raw),
    digest,
  };
}

export async function readRedirectMap(
  globalConfigId?: string,
): Promise<{ map: RedirectMap; digest: string; globalConfigId: string }> {
  const id = globalConfigId?.trim() || resolveGlobalConfigIdFromEnv();

  if (!canReadGlobalConfig(id)) {
    throw new Error(
      "Cannot read this Global Config. Set VERCEL_API_TOKEN or configure the default connection string.",
    );
  }

  const envConnectionString = getConnectionStringForConfigId(id);

  if (envConnectionString) {
    try {
      const result = await readRedirectMapViaSdk(id);
      return { ...result, globalConfigId: id };
    } catch (sdkError) {
      if (!isVercelApiConfigured()) {
        throw sdkError;
      }
      console.warn(
        "SDK read failed for Global Config from env connection; falling back to Vercel API.",
        sdkError,
      );
    }
  }

  if (isVercelApiConfigured()) {
    const result = await readRedirectMapViaApi(id);
    return { ...result, globalConfigId: id };
  }

  throw new Error(
    "VERCEL_API_TOKEN is required to read this Global Config (no matching env connection string).",
  );
}

async function patchRedirectsItem(
  globalConfigId: string,
  operation: PatchOperation,
  map: RedirectMap,
): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const response = await fetch(vercelApiUrl(`/${globalConfigId}/items`), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${getVercelApiToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [
        {
          operation,
          key: REDIRECTS_ITEM_KEY,
          value: map,
        },
      ],
    }),
  });

  const body = await response.text();

  if (!response.ok) {
    return { ok: false, status: response.status, body };
  }

  if (body) {
    const result = JSON.parse(body) as { status?: string };
    if (result.status && result.status !== "ok") {
      return { ok: false, status: response.status, body };
    }
  }

  return { ok: true };
}

export async function writeRedirectMap(
  map: RedirectMap,
  globalConfigId?: string,
): Promise<void> {
  if (!canWriteGlobalConfig()) {
    throw new Error("VERCEL_API_TOKEN is required to update Global Config");
  }

  const id = globalConfigId?.trim() || resolveGlobalConfigIdFromEnv();
  const patchPath = vercelApiUrl(`/${id}/items`).pathname;

  const attempts: PatchOperation[] = ["upsert", "create", "update"];
  let lastFailure: { status: number; body: string } | null = null;

  for (const operation of attempts) {
    const result = await patchRedirectsItem(id, operation, map);
    if (result.ok) return;

    lastFailure = { status: result.status, body: result.body };

    if (result.status === 404 && isNotFoundError(result.body)) {
      continue;
    }

    break;
  }

  const teamHint = process.env.VERCEL_TEAM_ID?.trim()
    ? ""
    : " If this store is on a Vercel team, set VERCEL_TEAM_ID in .env.local.";

  throw new Error(
    `Failed to update Global Config (${lastFailure?.status ?? "unknown"}) ` +
      `for ${patchPath}: ${lastFailure?.body ?? "unknown error"}.${teamHint}`,
  );
}
