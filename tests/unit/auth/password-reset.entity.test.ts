import {PasswordReset} from "../../../src/app/auth/entity/password-reset.entity";

function makeReset(expiresAt: Date): PasswordReset {
    return new PasswordReset({
        id: 1,
        userId: 1,
        otpHash: "hash",
        expiresAt,
        createdAt: new Date(),
    });
}

describe("PasswordReset.isExpired", () => {
    it("returns false when expiresAt is in the future", () => {
        const reset = makeReset(new Date(Date.now() + 60_000));

        expect(reset.isExpired()).toBe(false);
    })

    it("returns true when expiresAt is in the past", () => {
        const reset = makeReset(new Date(Date.now() - 60_000));

        expect(reset.isExpired()).toBe(true);
    })
})

describe("PasswordReset constructor", () => {
    it("defaults consumedAt to null when not provided", () => {
        const reset = makeReset(new Date());

        expect(reset.consumedAt).toBeNull();
    })

    it("keeps a provided consumedAt", () => {
        const consumedAt = new Date();
        const reset = new PasswordReset({
            id: 1,
            userId: 1,
            otpHash: "hash",
            expiresAt: new Date(),
            createdAt: new Date(),
            consumedAt,
        });

        expect(reset.consumedAt).toBe(consumedAt);
    })
})
