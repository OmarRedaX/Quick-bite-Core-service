import {toMs, toSeconds} from "../../../src/pkg/utils/time";

describe("toMs", () => {
    it("converts seconds", () => {
        expect(toMs(2, "s")).toBe(2000);
    })

    it("converts minutes", () => {
        expect(toMs(2, "m")).toBe(120_000);
    })

    it("converts hours", () => {
        expect(toMs(1, "h")).toBe(3_600_000);
    })

    it("converts days", () => {
        expect(toMs(1, "d")).toBe(86_400_000);
    })
})

describe("toSeconds", () => {
    it("converts hours to seconds", () => {
        expect(toSeconds(1, "h")).toBe(3600);
    })

    it("converts days to seconds", () => {
        expect(toSeconds(1, "d")).toBe(86_400);
    })
})
