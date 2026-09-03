import {Request, Response} from "express";
import type {requireInternalApiKey as RequireInternalApiKeyType} from "../../../src/lib/auth/api-key";

function mockRes() {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
}

function loadWithApiKey(apiKey: string): typeof RequireInternalApiKeyType {
    let requireInternalApiKey!: typeof RequireInternalApiKeyType;
    jest.isolateModules(() => {
        jest.doMock("../../../src/lib/config/env", () => ({
            env: {internal: {apiKey}},
        }));
        requireInternalApiKey = require("../../../src/lib/auth/api-key").requireInternalApiKey;
    });
    return requireInternalApiKey;
}

describe("requireInternalApiKey", () => {
    it("returns 500 when INTERNAL_API_KEY is not configured", () => {
        const requireInternalApiKey = loadWithApiKey("");
        const req = {headers: {"api-key": "anything"}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        requireInternalApiKey(req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(next).not.toHaveBeenCalled();
    })

    it("returns 401 when the api-key header does not match", () => {
        const requireInternalApiKey = loadWithApiKey("correct-key");
        const req = {headers: {"api-key": "wrong-key"}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        requireInternalApiKey(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    })

    it("calls next() when the api-key header matches", () => {
        const requireInternalApiKey = loadWithApiKey("correct-key");
        const req = {headers: {"api-key": "correct-key"}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        requireInternalApiKey(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    })
})
