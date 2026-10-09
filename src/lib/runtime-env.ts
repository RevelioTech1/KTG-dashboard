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

/** Асинхронный вариант — надёжнее в Cloudflare Workers / OpenNext. */
export async function getRuntimeEnvAsync(name: string): Promise<string | undefined> {
  const sync = getRuntimeEnv(name);
  if (sync) return sync;

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    const value = (ctx?.env as Record<string, unknown> | undefined)?.[name];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}
