import { log } from "../log";
import { sleep } from "../lib/util";

/** Serialises requests per upstream so free-tier rate limits are respected. */
class Throttle {
  private last = 0;
  private chain: Promise<void> = Promise.resolve();
  constructor(private readonly minIntervalMs: number) {}

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const wait = this.last + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
    });
    this.chain = run.catch(() => undefined);
    return run.then(task);
  }
}

const throttles = {
  gecko: new Throttle(2_100),
  dexscreener: new Throttle(220),
  default: new Throttle(0),
};

export type Upstream = keyof typeof throttles;

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(
  url: string,
  opts: { upstream?: Upstream; timeoutMs?: number; retries?: number; init?: RequestInit } = {},
): Promise<T> {
  const { upstream = "default", timeoutMs = 12_000, retries = 2, init } = opts;
  let attempt = 0;
  for (;;) {
    try {
      return await throttles[upstream].schedule(async () => {
        const res = await fetch(url, {
          ...init,
          headers: { accept: "application/json", ...(init?.headers ?? {}) },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new HttpError(`${res.status} ${res.statusText} ${body.slice(0, 160)}`, res.status);
        }
        return (await res.json()) as T;
      });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 0;
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || attempt >= retries) throw err;
      attempt += 1;
      const backoff = status === 429 ? 4_000 * attempt : 800 * attempt;
      log.debug(`retry ${attempt} for ${url} in ${backoff}ms`);
      await sleep(backoff);
    }
  }
}

/** Tiny TTL cache with in-flight de-duplication. */
export class TtlCache<V> {
  private store = new Map<string, { at: number; value: V }>();
  private inflight = new Map<string, Promise<V>>();
  constructor(private readonly ttlMs: number) {}

  peek(key: string): V | undefined {
    return this.store.get(key)?.value;
  }

  async get(key: string, load: () => Promise<V>, ttlMs = this.ttlMs): Promise<V> {
    const hit = this.store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const promise = load()
      .then((value) => {
        this.store.set(key, { at: Date.now(), value });
        return value;
      })
      .catch((err) => {
        // Serve stale data when the upstream fails.
        if (hit) return hit.value;
        throw err;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  set(key: string, value: V) {
    this.store.set(key, { at: Date.now(), value });
  }
}
