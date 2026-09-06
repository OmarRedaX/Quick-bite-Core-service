import jwt from "jsonwebtoken";
import {
    hashPassword,
    comparePassword,
    createAccessToken,
    createRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    generateOTP,
    hashOTP,
    JwtPayload,
} from "../../../src/app/auth/utils";

describe("comparePassword", () => {
    it("matches the hash produced by the hash password correctly", async () => {
        const password = "StrongPass"
        const hashedPassword = await hashPassword(password);

        expect( await comparePassword(password, hashedPassword)).toBe(true);
        expect ( await comparePassword("WrongPass", hashedPassword)).toBe(false);
    })
})

describe("createAccessToken / verifyAccessToken", () => {
    const payload: JwtPayload = {userId: 1, email: "user@example.com", role: "customer"};

    it("round-trips a payload signed with the access secret", () => {
        const token = createAccessToken(payload);
        const decoded = verifyAccessToken(token);

        expect(decoded).toMatchObject(payload);
    })

    it("throws when verifying a token signed with the refresh secret", () => {
        const token = createRefreshToken(payload);

        expect(() => verifyAccessToken(token)).toThrow();
    })

    it("throws for a malformed token", () => {
        expect(() => verifyAccessToken("not-a-jwt")).toThrow();
    })
})

describe("createRefreshToken / verifyRefreshToken", () => {
    const payload: JwtPayload = {userId: 2, email: "member@example.com", role: "restaurant_user", restaurantId: 5, restaurantRole: "owner", branchIds: [1, 2]};

    it("round-trips a payload signed with the refresh secret", () => {
        const token = createRefreshToken(payload);
        const decoded = verifyRefreshToken(token);

        expect(decoded).toMatchObject(payload);
    })

    it("throws when verifying a token signed with the access secret", () => {
        const token = createAccessToken(payload);

        expect(() => verifyRefreshToken(token)).toThrow();
    })
})

describe("generateOTP", () => {
    it("generates a 6-digit numeric string", () => {
        const otp = generateOTP();

        expect(otp).toMatch(/^\d{6}$/);
    })

    it("generates values across the full range, never below 100000", () => {
        for (let i = 0; i < 50; i++) {
            const otp = Number(generateOTP());
            expect(otp).toBeGreaterThanOrEqual(100000);
            expect(otp).toBeLessThanOrEqual(999999);
        }
    })
})

describe("hashOTP", () => {
    it("is deterministic for the same input", () => {
        expect(hashOTP("123456")).toBe(hashOTP("123456"));
    })

    it("produces different hashes for different OTPs", () => {
        expect(hashOTP("123456")).not.toBe(hashOTP("654321"));
    })

    it("never returns the plaintext OTP", () => {
        expect(hashOTP("123456")).not.toBe("123456");
    })
})

describe("token expiry normalization", () => {
    const payload: JwtPayload = {userId: 3, email: "expiry@example.com", role: "customer"};

    // Re-imports the token helpers with a fresh env module so the given
    // ACCESS_EXPIRES_IN / REFRESH_EXPIRES_IN value is what actually gets signed.
    function signedLifetime(variable: "ACCESS_EXPIRES_IN" | "REFRESH_EXPIRES_IN", value: string): number {
        const original = process.env[variable];
        process.env[variable] = value;

        try {
            let lifetime = 0;
            jest.isolateModules(() => {
                const utils = require("../../../src/app/auth/utils");
                const token = variable === "ACCESS_EXPIRES_IN"
                    ? utils.createAccessToken(payload)
                    : utils.createRefreshToken(payload);
                const {exp, iat} = jwt.decode(token) as {exp: number; iat: number};
                lifetime = exp - iat;
            });
            return lifetime;
        } finally {
            process.env[variable] = original;
        }
    }

    // Regression: jsonwebtoken reads a numeric STRING through ms(), which treats
    // bare digits as milliseconds -- "3600" used to sign a 3.6-second token.
    it("reads a bare numeric access expiry as seconds, not milliseconds", () => {
        const lifetime = signedLifetime("ACCESS_EXPIRES_IN", "3600");

        expect(lifetime).toBe(3600);
    })

    it("reads a bare numeric refresh expiry as seconds, not milliseconds", () => {
        const lifetime = signedLifetime("REFRESH_EXPIRES_IN", "604800");

        expect(lifetime).toBe(604800);
    })

    it("still reads a timespan access expiry as a timespan", () => {
        const lifetime = signedLifetime("ACCESS_EXPIRES_IN", "15m");

        expect(lifetime).toBe(15 * 60);
    })

    it("still reads a timespan refresh expiry as a timespan", () => {
        const lifetime = signedLifetime("REFRESH_EXPIRES_IN", "7d");

        expect(lifetime).toBe(7 * 24 * 60 * 60);
    })
})
