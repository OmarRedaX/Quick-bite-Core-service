import {Request, Response} from "express";
import {errorHandler} from "../../../src/lib/error/errorHandler";
import {AppError} from "../../../src/lib/error/AppError";

function mockRes() {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
}

function mockReq(): Request {
    return {body: {}, correlationId: "corr-1"} as unknown as Request;
}

describe("errorHandler", () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    })

    afterEach(() => {
        logSpy.mockRestore();
    })

    it("returns the AppError's own status and message for an operational error", () => {
        const err = new AppError("Restaurant not found", 404) as any;
        const res = mockRes();

        errorHandler(err, mockReq(), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({error: "Restaurant not found"});
    })

    it("returns a generic 'Invalid request body' for a non-operational body-parser SyntaxError (has a 4xx status field)", () => {
        const err = Object.assign(new SyntaxError("Unexpected token"), {status: 400, isOperational: false}) as any;
        const res = mockRes();

        errorHandler(err, mockReq(), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({error: "Invalid request body"});
    })

    it("returns a generic 500 for a truly unexpected error with no status field", () => {
        const err = Object.assign(new Error("something exploded"), {isOperational: false}) as any;
        const res = mockRes();

        errorHandler(err, mockReq(), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({error: "Something went wrong"});
    })

    it("returns a generic 500 when the status field is outside the 4xx range", () => {
        const err = Object.assign(new Error("upstream failure"), {isOperational: false, status: 502}) as any;
        const res = mockRes();

        errorHandler(err, mockReq(), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(500);
    })

    it("logs the error with statusCode, stack, operational flag, body, and correlationId", () => {
        const err = new AppError("boom", 400) as any;
        const req = {body: {a: 1}, correlationId: "corr-xyz"} as unknown as Request;

        errorHandler(err, req, mockRes(), jest.fn());

        expect(logSpy).toHaveBeenCalledTimes(1);
        const logged = JSON.parse(logSpy.mock.calls[0][0]);
        expect(logged).toMatchObject({
            level: "error",
            message: "boom",
            statusCode: 400,
            operational: true,
            body: {a: 1},
            correlationId: "corr-xyz",
        });
        expect(logged.stack).toEqual(expect.any(String));
    })
})
