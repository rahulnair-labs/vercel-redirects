import { NextResponse } from "next/server";
import {
  invalidateSiteRedirectCache,
  SITE_GLOBAL_CONFIG_REDIRECTS_TAG,
} from "@/lib/invalidate-site-redirect-cache";

export async function POST() {
  const result = await invalidateSiteRedirectCache();

  if (!result.attempted) {
    return NextResponse.json(
      {
        revalidated: false,
        tag: SITE_GLOBAL_CONFIG_REDIRECTS_TAG,
        error:
          "Set NEXT_PUBLIC_APP_BASE_URL and SITECORE_REVALIDATE_SECRET to clear the site app cache.",
      },
      { status: 503 },
    );
  }

  if (!result.revalidated) {
    return NextResponse.json(
      {
        revalidated: false,
        tag: SITE_GLOBAL_CONFIG_REDIRECTS_TAG,
        error: result.errors.join("; "),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    revalidated: true,
    tag: SITE_GLOBAL_CONFIG_REDIRECTS_TAG,
  });
}