import {Response} from "express";
import {setAuthCookies} from "../../../src/lib/utils/cookie";

function mockRes() {
    const res: Partial<Response> = {};
    res.cookie = jest.fn().mockReturnValue(res);
    return res as Response;
}

describe("setAuthCookies", () => {
    it("sets an httpOnly access_token cookie with a 1h maxAge", () => {
        const res = mockRes();

        setAuthCookies(res, "access-token-value", "refresh-token-value");

        expect(res.cookie).toHaveBeenCalledWith("access_token", "access-token-value", expect.objectContaining({
            httpOnly: true,
            maxAge: 60 * 60 * 1000,
        }));
    })

    it("sets an httpOnly refresh_token cookie with a 7d maxAge, scoped to the refresh route", () => {
        const res = mockRes();

        setAuthCookies(res, "access-token-value", "refresh-token-value");

        expect(res.cookie).toHaveBeenCalledWith("refresh_token", "refresh-token-value", expect.objectContaining({
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: "/api/auth/refresh",
        }));
    })

    it("sets both cookies", () => {
        const res = mockRes();

        setAuthCookies(res, "a", "r");

        expect(res.cookie).toHaveBeenCalledTimes(2);
    })
})
