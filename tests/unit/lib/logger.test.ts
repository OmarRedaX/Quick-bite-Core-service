import {Logger, logger} from "../../../src/lib/logger/logger";

describe("Logger", () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    })

    afterEach(() => {
        logSpy.mockRestore();
    })

    it("logs a JSON object with level, message, timestamp, and metadata merged in", () => {
        logger.info("something happened", {userId: 5});

        expect(logSpy).toHaveBeenCalledTimes(1);
        const logged = JSON.parse(logSpy.mock.calls[0][0]);
        expect(logged).toMatchObject({level: "info", message: "something happened", userId: 5});
        expect(typeof logged.timestamp).toBe("number");
    })

    it.each(["info", "error", "warn", "debug"] as const)("%s() logs with the matching level", (level) => {
        logger[level]("msg");

        const logged = JSON.parse(logSpy.mock.calls[0][0]);
        expect(logged.level).toBe(level);
    })

    it("defaults metadata to an empty object", () => {
        logger.warn("no metadata");

        const logged = JSON.parse(logSpy.mock.calls[0][0]);
        expect(logged).toEqual({level: "warn", message: "no metadata", timestamp: expect.any(Number)});
    })

    it("log() defaults metadata to an empty object when called directly with no metadata argument", () => {
        logger.log("info", "direct call");

        const logged = JSON.parse(logSpy.mock.calls[0][0]);
        expect(logged).toEqual({level: "info", message: "direct call", timestamp: expect.any(Number)});
    })

    it("is a singleton — every construction returns the same instance", () => {
        const a = new Logger();
        const b = new Logger();

        expect(a).toBe(b);
        expect(a).toBe(logger);
    })
})
