import "reflect-metadata"
import {validateBody} from "../../../src/lib/validation/validate";
import {UpdateUserDTO} from "../../../src/app/user/dto/user.dto";

describe("UpdateUserDTO", () => {
    it("accepts an empty payload (every field optional)", async () => {
        await expect(validateBody(UpdateUserDTO, {})).resolves.toBeInstanceOf(UpdateUserDTO);
    })

    it("accepts a valid name and phone", async () => {
        const result = await validateBody(UpdateUserDTO, {name: "New Name", phone: "01012345678"});

        expect(result).toMatchObject({name: "New Name", phone: "01012345678"});
    })

    it("rejects an empty name", async () => {
        await expect(validateBody(UpdateUserDTO, {name: ""})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a phone shorter than 10 characters", async () => {
        await expect(validateBody(UpdateUserDTO, {phone: "123"})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a phone longer than 11 characters", async () => {
        await expect(validateBody(UpdateUserDTO, {phone: "012345678901"})).rejects.toMatchObject({statusCode: 400});
    })
})
