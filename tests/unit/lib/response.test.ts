import {Response} from "express";
import {sendSuccess, sendPaginated} from "../../../src/lib/http/response";

function mockRes() {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
}

describe("sendSuccess", () => {
    it("omits meta from the body when not provided", () => {
        const res = mockRes();

        sendSuccess(res, {id: 1});

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({success: true, data: {id: 1}});
    })

    it("includes meta in the body when provided", () => {
        const res = mockRes();

        sendSuccess(res, {id: 1}, 200, {requestId: "abc"});

        expect(res.json).toHaveBeenCalledWith({success: true, data: {id: 1}, meta: {requestId: "abc"}});
    })

    it("uses the given status code", () => {
        const res = mockRes();

        sendSuccess(res, {id: 1}, 201);

        expect(res.status).toHaveBeenCalledWith(201);
    })
})

describe("sendPaginated", () => {
    it("always responds 200 with success/data/meta", () => {
        const res = mockRes();
        const meta = {nextCursor: null, hasMore: false, count: 1};

        sendPaginated(res, [{id: 1}], meta);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({success: true, data: [{id: 1}], meta});
    })
})
