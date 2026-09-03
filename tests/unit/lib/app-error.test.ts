import {AppError} from "../../../src/lib/error/AppError";

describe("AppError", () => {
    it("defaults statusCode to 500 and isOperational to true", () => {
        const err = new AppError("boom");

        expect(err.statusCode).toBe(500);
        expect(err.isOperational).toBe(true);
        expect(err.message).toBe("boom");
    })

    it("accepts an explicit statusCode and isOperational", () => {
        const err = new AppError("not found", 404, false);

        expect(err.statusCode).toBe(404);
        expect(err.isOperational).toBe(false);
    })

    it("is an instance of Error", () => {
        const err = new AppError("boom");

        expect(err).toBeInstanceOf(Error);
    })
})
