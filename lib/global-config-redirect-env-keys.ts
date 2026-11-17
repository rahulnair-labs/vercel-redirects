export const GLOBAL_CONFIG_REDIRECT_CONNECTION_ENV_KEYS = [
  "GLOBAL_CONFIG_REDIRECTS_1",
  "GLOBAL_CONFIG_REDIRECTS_2",
  "GLOBAL_CONFIG_REDIRECTS_3",
] as const;

export function getGlobalConfigRedirectConnectionEnvKeys(): readonly string[] {
  return GLOBAL_CONFIG_REDIRECT_CONNECTION_ENV_KEYS;
}

export function getGlobalConfigRedirectConnectionEnvKeysLabel(): string {
  return getGlobalConfigRedirectConnectionEnvKeys().join(", ");
}
