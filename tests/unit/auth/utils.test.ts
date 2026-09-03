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
