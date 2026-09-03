import "reflect-metadata"
import {Request, Response} from "express";
import {idempotency} from "../../../src/lib/idempotency/idempotency";
import {container} from "../../../src/lib/di/container";
import {TOKENS} from "../../../src/lib/di/tokens";
import {ICacheProvider} from "../../../src/pkg/cache/cache.interface";

function mockRes() {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
}

function mockReq(method: string, headers: Record<string, string> = {}): Request {
    return {method, headers, originalUrl: "/api/test"} as unknown as Request;
}

describe("idempotency() middleware", () => {
    it("skips non-mutating methods (GET) entirely, even in strict mode", async () => {
        const middleware = idempotency({strict: true});
        const req = mockReq("GET");
        const res = mockRes();
        const next = jest.fn();

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    })

    it("passes through without a key when not strict", async () => {
        const middleware = idempotency({strict: false});
        const req = mockReq("POST");
        const res = mockRes();
        const next = jest.fn();

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
    })

    it("defaults to non-strict (passes through without a key) when no options are given", async () => {
        const middleware = idempotency();
        const req = mockReq("POST");
        const res = mockRes();
        const next = jest.fn();

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
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

        it("returns 503 in strict mode when the cache provider throws", async () => {
            const middleware = idempotency({strict: true});
            const req = mockReq("POST", {"idempotency-key": "k1"});
            const res = mockRes();
            const next = jest.fn();

            await middleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(503);
            expect(next).not.toHaveBeenCalled();
        })

        it("falls through to next() in non-strict mode when the cache provider throws", async () => {
            const middleware = idempotency({strict: false});
            const req = mockReq("POST", {"idempotency-key": "k1"});
            const res = mockRes();
            const next = jest.fn();

            await middleware(req, res, next);

            expect(next).toHaveBeenCalledWith();
            expect(res.status).not.toHaveBeenCalled();
        })
    })
})
