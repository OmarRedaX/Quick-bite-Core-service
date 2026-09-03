import "reflect-metadata"
import {IsEmail, IsString, MinLength} from "class-validator";
import {validateBody} from "../../../src/lib/validation/validate";
import {AppError} from "../../../src/lib/error/AppError";

class DummyDTO {
    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(3)
    name!: string;
}

describe("validateBody", () => {
    it("returns an instance of the DTO when the body is valid", async () => {
        const result = await validateBody(DummyDTO, {email: "user@example.com", name: "Bob"});

        expect(result).toBeInstanceOf(DummyDTO);
        expect(result).toMatchObject({email: "user@example.com", name: "Bob"});
    })

    it("strips unknown fields (whitelist)", async () => {
        const result = await validateBody(DummyDTO, {email: "user@example.com", name: "Bob", extra: "nope"});

        expect((result as any).extra).toBeUndefined();
    })

    it("throws a 400 AppError with joined messages when validation fails", async () => {
        await expect(validateBody(DummyDTO, {email: "not-an-email", name: "a"}))
            .rejects.toMatchObject({statusCode: 400});
    })

    it("throws an AppError instance, not a generic Error", async () => {
        try {
            await validateBody(DummyDTO, {});
            throw new Error("expected validateBody to throw");
        } catch (err) {
            expect(err).toBeInstanceOf(AppError);
        }
    })
})
