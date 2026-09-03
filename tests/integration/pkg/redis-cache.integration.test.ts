import {RedisCacheProvider} from "../../../src/pkg/cache/redis";
import {env} from "../../../src/lib/config/env";

const TEST_KEY_PREFIX = "pkgcache-test:";

function key(name: string): string {
    return `${TEST_KEY_PREFIX}${name}`;
}

describe("RedisCacheProvider (real local Redis)", () => {
    let provider: RedisCacheProvider;

    beforeAll(() => {
        provider = new RedisCacheProvider({host: env.redis.host, port: env.redis.port, password: env.redis.password || undefined});
    })

    afterAll(async () => {
        await provider.del(key("basic"));
        await provider.del(key("ttl"));
        await provider.del(key("missing"));
    })

    it("returns null for a key that was never set", async () => {
        const value = await provider.get(key("missing"));

        expect(value).toBeNull();
    })

    it("round-trips a value through set/get", async () => {
        await provider.set(key("basic"), JSON.stringify({hello: "world"}));

        const value = await provider.get(key("basic"));

        expect(JSON.parse(value)).toEqual({hello: "world"});
    })

    it("expires a value after its TTL", async () => {
        await provider.set(key("ttl"), "expires-soon", 1);

        const immediately = await provider.get(key("ttl"));
        expect(immediately).toBe("expires-soon");

        await new Promise((resolve) => setTimeout(resolve, 1200));
        const afterExpiry = await provider.get(key("ttl"));
        expect(afterExpiry).toBeNull();
    })

    it("deletes a key", async () => {
        await provider.set(key("basic"), "to-delete");

        await provider.del(key("basic"));

        expect(await provider.get(key("basic"))).toBeNull();
    })
})
