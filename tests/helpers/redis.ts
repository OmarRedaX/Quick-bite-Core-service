import Redis from "ioredis";
import {env} from "../../src/lib/config/env";

const client = new Redis({
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password || undefined,
    lazyConnect: true,
});

async function deleteByPattern(pattern: string): Promise<void> {
    if (client.status !== "ready") await client.connect();
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
        await client.del(...keys);
    }
}

export async function flushIdempotencyCache(): Promise<void> {
    await deleteByPattern("idempotency:*");
}

// `withCache()` (src/lib/cache/withCache.ts) keys every cached GET response as
// `GET:<originalUrl>` in the same local Redis used by `npm run dev`. Every
// cached route in this app is a GET, so this prefix is a safe, targeted
// equivalent of truncateAll() for that middleware's state -- it only clears
// cached HTTP responses (which regenerate on demand), never real data.
export async function flushHttpCache(): Promise<void> {
    await deleteByPattern("GET:*");
}

export async function flushTestCache(): Promise<void> {
    await flushIdempotencyCache();
    await flushHttpCache();
}

export async function closeRedisTestClient(): Promise<void> {
    if (client.status !== "end") await client.quit();
}
