import { NextRequest, NextResponse } from "next/server";
import { getGlobalConfigRedirectConnectionEnvKeysLabel } from "@/lib/global-config-redirect-env-keys";
import {
  canReadGlobalConfig,
  canWriteGlobalConfig,
  getDefaultGlobalConfigId,
  readRedirectMap,
  writeRedirectMap,
} from "@/lib/global-config-store";
import { invalidateSiteRedirectCache } from "@/lib/invalidate-site-redirect-cache";
import {
  normalizeSourcePath,
  redirectMapToRows,
  validateRedirectInput,
  type RedirectMap,
} from "@/lib/redirects";

async function purgeSiteRedirectCacheAfterWrite() {
  const siteCache = await invalidateSiteRedirectCache();
  if (siteCache.attempted && !siteCache.revalidated) {
    console.warn(
      "[RedirectManager] Site redirect cache purge failed:",
      siteCache.errors.join("; "),
    );
  }
  return siteCache;
}

function resolveConfigIdFromRequest(
  request: NextRequest,
  bodyGlobalConfigId?: string,
): string | null {
  const fromQuery = request.nextUrl.searchParams.get("globalConfigId");
  const fromBody = bodyGlobalConfigId?.trim();
  const id = fromBody || fromQuery || getDefaultGlobalConfigId();
  return id?.trim() || null;
}

export async function GET(request: NextRequest) {
  const globalConfigId = resolveConfigIdFromRequest(request);
  if (!globalConfigId) {
    return NextResponse.json({
      configured: false,
      redirects: [],
      digest: null,
      globalConfigId: null,
      message:
        `Select a Global Config or set ${getGlobalConfigRedirectConnectionEnvKeysLabel()} / GLOBAL_CONFIG_ID`,
    });
  }

  if (!canReadGlobalConfig(globalConfigId)) {
    return NextResponse.json(
      {
        error:
          "Cannot read this Global Config. Set VERCEL_API_TOKEN or the default connection string.",
      },
      { status: 503 },
    );
  }

  try {
    const { map, digest } = await readRedirectMap(globalConfigId);
    return NextResponse.json({
      configured: true,
      globalConfigId,
      redirects: redirectMapToRows(map),
      digest,
    });
  } catch (error) {
    console.error("GET /api/redirects", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load redirects",
      },
      { status: 500 },
    );
  }
}

type UpsertBody = {
  source: string;
  destination: string;
  status: number;
  globalConfigId?: string;
  previousSource?: string;
};

type DeleteBody = {
  source: string;
  globalConfigId?: string;
};

async function loadMapForMutation(globalConfigId: string): Promise<RedirectMap> {
  const { map } = await readRedirectMap(globalConfigId);
  return { ...map };
}

export async function POST(request: NextRequest) {
  if (!canWriteGlobalConfig()) {
    return NextResponse.json(
      { error: "VERCEL_API_TOKEN is required to save redirects" },
      { status: 503 },
    );
  }

  let body: UpsertBody;
  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const globalConfigId = resolveConfigIdFromRequest(
    request,
    body.globalConfigId,
  );
  if (!globalConfigId || !canReadGlobalConfig(globalConfigId)) {
    return NextResponse.json(
      { error: "Valid globalConfigId is required" },
      { status: 400 },
    );
  }

  const source = normalizeSourcePath(body.source ?? "");
  const destination = (body.destination ?? "").trim();
  const status = Number(body.status);

  const validationError = validateRedirectInput(source, destination, status);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const map = await loadMapForMutation(globalConfigId);
    const previousSource = body.previousSource
      ? normalizeSourcePath(body.previousSource)
      : null;
    if (previousSource && previousSource !== source) {
      delete map[previousSource];
    }
    map[source] = { destination, status };
    await writeRedirectMap(map, globalConfigId);
    const siteCache = await purgeSiteRedirectCacheAfterWrite();
    const { map: updated, digest } = await readRedirectMap(globalConfigId);
    return NextResponse.json({
      globalConfigId,
      redirects: redirectMapToRows(updated),
      digest,
      siteCacheRevalidated: siteCache.revalidated,
    });
  } catch (error) {
    console.error("POST /api/redirects", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save redirect",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!canWriteGlobalConfig()) {
    return NextResponse.json(
      { error: "VERCEL_API_TOKEN is required to delete redirects" },
      { status: 503 },
    );
  }

  let body: DeleteBody;
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const globalConfigId = resolveConfigIdFromRequest(
    request,
    body.globalConfigId,
  );
  if (!globalConfigId || !canReadGlobalConfig(globalConfigId)) {
    return NextResponse.json(
      { error: "Valid globalConfigId is required" },
      { status: 400 },
    );
  }

  const source = normalizeSourcePath(body.source ?? "");
  if (!source.startsWith("/")) {
    return NextResponse.json({ error: "Invalid source path" }, { status: 400 });
  }

  try {
    const map = await loadMapForMutation(globalConfigId);
    if (!map[source]) {
      return NextResponse.json(
        { error: `No redirect found for ${source}` },
        { status: 404 },
      );
    }
    delete map[source];
    await writeRedirectMap(map, globalConfigId);
    const siteCache = await purgeSiteRedirectCacheAfterWrite();
    const { map: updated, digest } = await readRedirectMap(globalConfigId);
    return NextResponse.json({
      globalConfigId,
      redirects: redirectMapToRows(updated),
      digest,
      siteCacheRevalidated: siteCache.revalidated,
    });
  } catch (error) {
    console.error("DELETE /api/redirects", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete redirect",
      },
      { status: 500 },
    );
  }
}
