/**
 * Читает переменные окружения и в Node (process.env), и в Cloudflare Workers
 * (secrets / vars через getCloudflareContext().env).
 */
export function getRuntimeEnv(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@opennextjs/cloudflare") as {
      getCloudflareContext?: (opts?: { async?: boolean }) => {
        env?: Record<string, unknown>;
      };
    };
    const ctx = mod.getCloudflareContext?.({ async: false });
    const value = ctx?.env?.[name];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}
