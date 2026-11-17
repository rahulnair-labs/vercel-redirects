/** Must match `src/lib/cache/global-config-redirects-cache-tag.ts` on the site app. */
export const SITE_GLOBAL_CONFIG_REDIRECTS_TAG = "site:global-config:redirects";

export type SiteRedirectCacheInvalidation = {
  attempted: boolean;
  revalidated: boolean;
  errors: string[];
};

function authHeaders(secret: string): Record<string, string> {
  const vercelBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

  return {
    "Content-Type": "application/json",
    "x-revalidate-secret": secret,
    ...(vercelBypass && { "x-vercel-protection-bypass": vercelBypass }),
  };
}

/** POST /api/admin/global-config-redirects/revalidate on the site app. */
export async function invalidateSiteRedirectCache(): Promise<SiteRedirectCacheInvalidation> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim().replace(
    /\/$/,
    "",
  );
  const secret = process.env.SITECORE_REVALIDATE_SECRET?.trim();

  if (!baseUrl) {
    return { attempted: false, revalidated: false, errors: [] };
  }

  if (!secret) {
    return {
      attempted: true,
      revalidated: false,
      errors: ["SITECORE_REVALIDATE_SECRET is not set"],
    };
  }

  const purgeUrl = `${baseUrl}/api/admin/global-config-redirects/revalidate`;
  try {
    const response = await fetch(purgeUrl, {
      method: "POST",
      headers: authHeaders(secret),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      return {
        attempted: true,
        revalidated: false,
        errors: [`${purgeUrl}: ${response.status} ${bodyText}`],
      };
    }

    return {
      attempted: true,
      revalidated: true,
      errors: [],
    };
  } catch (error) {
    return {
      attempted: true,
      revalidated: false,
      errors: [
        `${purgeUrl}: ${error instanceof Error ? error.message : "request failed"}`,
      ],
    };
  }
}