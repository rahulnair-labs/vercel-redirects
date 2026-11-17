# Redirect Manager (Sitecore Marketplace App)



Manage pathname redirects stored in **Vercel Global Config** (`redirects` item). The Global Config dropdown lists only shards you configure via `GLOBAL_CONFIG_REDIRECTS_1`–`_3` connection strings. It does not modify the main headless application.



## Routes



| Route | Marketplace extension point | Purpose |

|-------|----------------------------|---------|

| `/` | Standalone (optional) | Landing + link to dashboard |

| `/dashboard` | Full screen | Pick a Global Config, list/add/edit/delete `redirects` |

| `/api/global-configs` | — | List Global Configs (Vercel API) |

| `/api/redirects` | — | List / create / update / delete `redirects` (purges site redirect cache when configured) |

| `/api/redirects/revalidate-cache` | — | `POST` — clear `site:global-config:redirects` on the site app (dashboard button) |



## Environment



Copy `.env.local.example` → `.env.local`:



| Variable | Required | Purpose |

|----------|----------|---------|

| `GLOBAL_CONFIG_REDIRECTS_1` … `_3` | Yes (read) | Global Config connection string(s); one per shard you use |

| `VERCEL_API_TOKEN` | Yes (write) | `PATCH /v1/global-config/{id}/items` ([Vercel API](https://vercel.com/docs/global-config/vercel-api)) |

| `GLOBAL_CONFIG_ID` | No | Override `ecfg_…` id if needed (otherwise parsed from the connection string) |

| `VERCEL_TEAM_ID` | Team stores | **Required** `?teamId=` on PATCH when the config is not on your personal Hobby scope |

| `NEXT_PUBLIC_APP_BASE_URL` | Site cache button | Site app origin (e.g. `http://localhost:3000`) |

| `SITECORE_REVALIDATE_SECRET` | Site cache button | Must match the site app; sent as `x-revalidate-secret` |



If PATCH returns `404` / `not_found`, confirm `VERCEL_API_TOKEN` is scoped to the same team as the store and set `VERCEL_TEAM_ID`.



On save/delete, the extension calls **`POST /api/admin/global-config-redirects/revalidate`** when `NEXT_PUBLIC_APP_BASE_URL` and `SITECORE_REVALIDATE_SECRET` are set. You can also use **Purge redirects cache** on the dashboard.



## Local development



```bash

cd extensions/RedirectManager

pnpm install

pnpm dev

```



Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard).



## Redirect shape



```json

{

  "/old-path": {

    "destination": "/new-path",

    "status": 301

  }

}

```



Sources must start with `/`. Status must be 300–399.


