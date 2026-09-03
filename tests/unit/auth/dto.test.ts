import "reflect-metadata"
import {validateBody} from "../../../src/lib/validation/validate";
import {RegisterDTO, LoginDTO, ForgetPasswordDTO, ResetPasswordDTO} from "../../../src/app/auth/dto/auth.dto";
import {SystemRole} from "../../../src/app/user/enums";

const STRONG_PASSWORD = "StrongPass1!";

describe("RegisterDTO", () => {
    it("accepts a valid customer payload", async () => {
        await expect(validateBody(RegisterDTO, {
            email: "user@example.com",
            phone: "01012345678",
            name: "User",
            password: STRONG_PASSWORD,
            role: SystemRole.CUSTOMER,
        })).resolves.toBeInstanceOf(RegisterDTO);
    })

    it("accepts a valid restaurant_user payload with nested restaurant data", async () => {
        const result = await validateBody(RegisterDTO, {
            email: "owner@example.com",
            phone: "01012345678",
            name: "Owner",
            password: STRONG_PASSWORD,
            role: SystemRole.RESTAURANT_USER,
            restaurant: {name: "Tasty Bites", primaryCountry: "eg"},
        });

        expect(result.restaurant).toMatchObject({name: "Tasty Bites", primaryCountry: "eg"});
    })

    it("rejects an invalid email", async () => {
        await expect(validateBody(RegisterDTO, {
            email: "not-an-email",
            phone: "01012345678",
            name: "User",
            password: STRONG_PASSWORD,
            role: SystemRole.CUSTOMER,
        })).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a phone shorter than 10 digits", async () => {
        await expect(validateBody(RegisterDTO, {
            email: "user@example.com",
            phone: "123",
            name: "User",
            password: STRONG_PASSWORD,
            role: SystemRole.CUSTOMER,
        })).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a password missing a symbol", async () => {
        await expect(validateBody(RegisterDTO, {
            email: "user@example.com",
            phone: "01012345678",
            name: "User",
            password: "NoSymbol1",
            role: SystemRole.CUSTOMER,
        })).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a role outside the SystemRole enum", async () => {
        await expect(validateBody(RegisterDTO, {
            email: "user@example.com",
            phone: "01012345678",
            name: "User",
            password: STRONG_PASSWORD,
            role: "super_admin",
        })).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects an invalid nested restaurant payload", async () => {
        await expect(validateBody(RegisterDTO, {
            email: "owner@example.com",
            phone: "01012345678",
            name: "Owner",
            password: STRONG_PASSWORD,
            role: SystemRole.RESTAURANT_USER,
            restaurant: {name: "", primaryCountry: "eg"},
        })).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a missing name", async () => {
        await expect(validateBody(RegisterDTO, {
            email: "user@example.com",
            phone: "01012345678",
            password: STRONG_PASSWORD,
            role: SystemRole.CUSTOMER,
        })).rejects.toMatchObject({statusCode: 400});
    })
})

describe("LoginDTO", () => {
    it("accepts a valid payload", async () => {
        await expect(validateBody(LoginDTO, {email: "user@example.com", password: "anything"}))
            .resolves.toBeInstanceOf(LoginDTO);
    })

    it("rejects an empty password", async () => {
        await expect(validateBody(LoginDTO, {email: "user@example.com", password: ""}))
            .rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a missing email", async () => {
        await expect(validateBody(LoginDTO, {password: "anything"}))
            .rejects.toMatchObject({statusCode: 400});
    })
})

describe("ForgetPasswordDTO", () => {
    it("accepts a valid email", async () => {
        await expect(validateBody(ForgetPasswordDTO, {email: "user@example.com"}))
            .resolves.toBeInstanceOf(ForgetPasswordDTO);
    })

    it("rejects an invalid email", async () => {
        await expect(validateBody(ForgetPasswordDTO, {email: "not-an-email"}))
            .rejects.toMatchObject({statusCode: 400});
    })
})

describe("ResetPasswordDTO", () => {
    it("accepts a valid payload", async () => {
        await expect(validateBody(ResetPasswordDTO, {
            email: "user@example.com",
            otp: "123456",
            newPassword: STRONG_PASSWORD,
        })).resolves.toBeInstanceOf(ResetPasswordDTO);
    })

    it("rejects an OTP that isn't exactly 6 characters", async () => {
        await expect(validateBody(ResetPasswordDTO, {
            email: "user@example.com",
            otp: "123",
            newPassword: STRONG_PASSWORD,
        })).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a weak newPassword", async () => {
        await expect(validateBody(ResetPasswordDTO, {
            email: "user@example.com",
            otp: "123456",
            newPassword: "weak",
        })).rejects.toMatchObject({statusCode: 400});
    })
})
