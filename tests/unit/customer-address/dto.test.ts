import "reflect-metadata"
import {validateBody} from "../../../src/lib/validation/validate";
import {CreateAddressDTO, UpdateAddressDTO} from "../../../src/app/customer-address/dto/customer-address.dto";

const validCreate = {
    label: "Home", country: "EG", city: "Cairo", street: "1 Test St",
    type: "home", lat: 30.05, lng: 31.23, isDefault: true,
};

describe("CreateAddressDTO", () => {
    it("accepts a valid payload", async () => {
        await expect(validateBody(CreateAddressDTO, validCreate)).resolves.toBeInstanceOf(CreateAddressDTO);
    })

    it("accepts optional building/apartmentNumber", async () => {
        const result = await validateBody(CreateAddressDTO, {...validCreate, building: "B1", apartmentNumber: "12"});

        expect(result).toMatchObject({building: "B1", apartmentNumber: "12"});
    })

    it("rejects a missing required field", async () => {
        const {street, ...rest} = validCreate;
        await expect(validateBody(CreateAddressDTO, rest)).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a type outside the AddressType enum", async () => {
        await expect(validateBody(CreateAddressDTO, {...validCreate, type: "castle"}))
            .rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a non-boolean isDefault", async () => {
        await expect(validateBody(CreateAddressDTO, {...validCreate, isDefault: "yes"}))
            .rejects.toMatchObject({statusCode: 400});
    })

    it("rejects an empty label", async () => {
        await expect(validateBody(CreateAddressDTO, {...validCreate, label: ""}))
            .rejects.toMatchObject({statusCode: 400});
    })
})

describe("UpdateAddressDTO", () => {
    it("accepts an empty payload (every field optional)", async () => {
        await expect(validateBody(UpdateAddressDTO, {})).resolves.toBeInstanceOf(UpdateAddressDTO);
    })

    it("accepts every optional field at once", async () => {
        const result = await validateBody(UpdateAddressDTO, {
            country: "SA", city: "Riyadh", street: "2 New St", building: "B2",
            apartmentNumber: "12", type: "office", lat: 24.7, lng: 46.6, isDefault: false,
        });

        expect(result).toMatchObject({country: "SA", city: "Riyadh", type: "office", isDefault: false});
    })

    it("rejects an empty street when provided", async () => {
        await expect(validateBody(UpdateAddressDTO, {street: ""})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a type outside the AddressType enum", async () => {
        await expect(validateBody(UpdateAddressDTO, {type: "castle"})).rejects.toMatchObject({statusCode: 400});
    })
})
