import { NextResponse } from "next/server";

import { getGlobalConfigRedirectConnectionEnvKeysLabel } from "@/lib/global-config-redirect-env-keys";

import {

  getDefaultGlobalConfigId,

  isVercelApiConfigured,

  listProfileGlobalConfigs,

} from "@/lib/global-config-store";



export async function GET() {

  const configs = await listProfileGlobalConfigs();



  if (configs.length === 0) {

    return NextResponse.json({

      configured: false,

      configs: [],

      defaultGlobalConfigId: null,

      message: `Set at least one of ${getGlobalConfigRedirectConnectionEnvKeysLabel()}.`,

    });

  }



  const defaultId = getDefaultGlobalConfigId();

  const defaultGlobalConfigId =

    defaultId && configs.some((c) => c.id === defaultId)

      ? defaultId

      : configs[0]?.id ?? null;



  return NextResponse.json({

    configured: true,

    configs,

    defaultGlobalConfigId,

    message: !isVercelApiConfigured()

      ? "Set VERCEL_API_TOKEN to create, update, or delete redirects."

      : undefined,

  });

}


