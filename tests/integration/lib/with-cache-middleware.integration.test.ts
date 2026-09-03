import "reflect-metadata"
import {Request, Response} from "express";
import {withCache} from "../../../src/lib/cache/withCache";
import {container} from "../../../src/lib/di/container";
import {TOKENS} from "../../../src/lib/di/tokens";
import {ICacheProvider} from "../../../src/pkg/cache/cache.interface";

function mockRes() {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn();
    res.statusCode = 200;
    return res as Response;
}

function mockReq(overrides: Partial<Request> = {}): Request {
    return {method: "GET", originalUrl: "/api/test", ...overrides} as unknown as Request;
}

describe("withCache() middleware", () => {
    it("scopes the cache key by userId when userScoped is true", async () => {
        const setMock = jest.fn();
        const provider: ICacheProvider = {get: jest.fn().mockResolvedValue(null), set: setMock, del: jest.fn()};
        const realProvider = container.resolve<ICacheProvider>(TOKENS.CacheProvider);
        container.registerInstance(TOKENS.CacheProvider, provider);

        try {
            const middleware = withCache(60, true);
            const req = mockReq({user: {userId: 42, role: "customer", email: "a@b.com"}} as any);
            const res = mockRes();
            const next = jest.fn();

            await middleware(req, res, next);
            expect(next).toHaveBeenCalledWith();
            // trigger the wrapped res.json to see the key actually used for the cache write
            (res.json as any)({hello: "world"});

            expect(setMock).toHaveBeenCalledWith("GET:/api/test:42", JSON.stringify({hello: "world"}), 60);
        } finally {
            container.registerInstance(TOKENS.CacheProvider, realProvider);
        }
    })

    describe("when the cache provider is unavailable", () => {
        let realProvider: ICacheProvider;
        const brokenProvider: ICacheProvider = {
            get: jest.fn().mockRejectedValue(new Error("redis down")),
            set: jest.fn(),
            del: jest.fn(),
        };

        beforeEach(() => {
            realProvider = container.resolve<ICacheProvider>(TOKENS.CacheProvider);
            container.registerInstance(TOKENS.CacheProvider, brokenProvider);
        })

        afterEach(() => {
            container.registerInstance(TOKENS.CacheProvider, realProvider);
        })

        it("passes the error to next() instead of throwing", async () => {
            const middleware = withCache();
            const req = mockReq();
            const res = mockRes();
            const next = jest.fn();

            await middleware(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(Error));
        })
    })
})
