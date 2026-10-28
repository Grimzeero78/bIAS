import { PrismaClient } from "@prisma/client";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Environment-adaptive database client.
 *
 *  - LOCAL / full Node deployments → SQLite file via the standard Prisma engine.
 *  - CLOUDFLARE WORKERS (OpenNext) → D1 via PrismaD1 + the queryCompiler-based
 *    client generated to src/generated/prisma-cf (the Rust engine cannot run
 *    inside workerd).
 *
 * `db` is a lazy proxy: every `db.model.op(args)` call resolves the right
 * client at call time (getCloudflareContext is sync and throws off-CF), so
 * call sites stay identical in both runtimes.
 */

type AnyPrisma = PrismaClient | (new (...a: never[]) => unknown extends never ? never : object);

const g = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaD1Cache: WeakMap<object, Promise<PrismaClient>> | undefined;
};

function localClient(): PrismaClient {
  if (g.prisma) return g.prisma;
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  g.prisma = client;
  return client;
}

async function createD1Client(binding: object): Promise<PrismaClient> {
  // Imported lazily so the local (engine) bundle never loads the WASM compiler.
  const mod = (await import("@/generated/prisma-cf/client")) as unknown as {
    PrismaClient: new (opts: { adapter: unknown }) => PrismaClient;
  };
  const { PrismaD1 } = await import("@prisma/adapter-d1");
  return new mod.PrismaClient({ adapter: new PrismaD1(binding as never) });
}

async function resolveClient(): Promise<PrismaClient> {
  try {
    // Throws outside OpenNext (plain Node / sandbox) — that's the local signal.
    const env = getCloudflareContext().env as { DB?: object } | undefined;
    if (env?.DB) {
      if (!g.prismaD1Cache) g.prismaD1Cache = new WeakMap();
      let p = g.prismaD1Cache.get(env.DB);
      if (!p) {
        p = createD1Client(env.DB);
        g.prismaD1Cache.set(env.DB, p);
      }
      return await p;
    }
  } catch {
    /* not on Cloudflare — fall through to the local client */
  }
  return localClient();
}

function unreachable(): never {
  throw new Error("TrueMerit db proxy: unsupported access pattern (use db.model.op(args))");
}

/**
 * Outer proxy: db.<modelOrClientProp> → a callable+property-accessible delegate.
 * Inner proxy: applying it runs `<prop>(...args)`; property access chains one
 * more level (`db.<model>.<op>(...args)`). Both resolve the client per call.
 */
export const db = new Proxy(
  {},
  {
    get(_t, prop: string | symbol) {
      if (prop === "then" || prop === "catch" || prop === "finally") return undefined;
      return new Proxy(function () {} as unknown as Record<string | symbol, unknown>, {
        apply(_target, _thisArg, args: unknown[]) {
          // e.g. db.$transaction(fn), db.$disconnect()
          return resolveClient().then((c) => {
            const fn = (c as unknown as Record<string | symbol, unknown>)[prop];
            if (typeof fn !== "function") return unreachable();
            return (fn as (...a: unknown[]) => unknown).apply(c, args);
          });
        },
        get(_t2, op: string | symbol) {
          if (op === "then" || op === "catch" || op === "finally") return undefined;
          return (...args: unknown[]) =>
            resolveClient().then((c) => {
              const model = (c as unknown as Record<string | symbol, Record<string | symbol, unknown>>)[prop];
              const fn = model?.[op];
              if (typeof fn !== "function") return unreachable();
              return (fn as (...a: unknown[]) => unknown).apply(model, args);
            });
        },
      });
    },
  }
) as unknown as PrismaClient;

export type DbClient = PrismaClient;
