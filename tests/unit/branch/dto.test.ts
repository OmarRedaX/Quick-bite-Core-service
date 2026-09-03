import "reflect-metadata"
import {validateBody} from "../../../src/lib/validation/validate";
import {CreateBranchDTO, UpdateBranchDTO, UpdateBranchStatusDTO} from "../../../src/app/branch/dto/branch.dto";

const validCreate = {
    countryCode: "EG", label: "Downtown", addressText: "1 Main St",
    lat: 30.05, lng: 31.24, opensAt: "09:00", closesAt: "22:00",
    deliveryRadius: 5, currency: "EGP",
};

describe("CreateBranchDTO", () => {
    it("accepts a valid payload", async () => {
        await expect(validateBody(CreateBranchDTO, validCreate)).resolves.toBeInstanceOf(CreateBranchDTO);
    })

    it("rejects a missing required field", async () => {
        const {label, ...rest} = validCreate;
        await expect(validateBody(CreateBranchDTO, rest)).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a non-numeric lat/lng", async () => {
        await expect(validateBody(CreateBranchDTO, {...validCreate, lat: "not-a-number"}))
            .rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a negative deliveryRadius", async () => {
        await expect(validateBody(CreateBranchDTO, {...validCreate, deliveryRadius: -1}))
            .rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a non-integer deliveryRadius", async () => {
        await expect(validateBody(CreateBranchDTO, {...validCreate, deliveryRadius: 5.5}))
            .rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a currency outside the Currency enum", async () => {
        await expect(validateBody(CreateBranchDTO, {...validCreate, currency: "USD"}))
            .rejects.toMatchObject({statusCode: 400});
    })
})

describe("UpdateBranchDTO", () => {
    it("accepts an empty payload (every field optional)", async () => {
        await expect(validateBody(UpdateBranchDTO, {})).resolves.toBeInstanceOf(UpdateBranchDTO);
    })

    it("accepts every optional field at once", async () => {
        const result = await validateBody(UpdateBranchDTO, {
            label: "Renamed", addressText: "2 New St", lat: 30.1, lng: 31.1,
            opensAt: "08:00", closesAt: "23:00", deliveryRadius: 8,
            deliveryFee: 250, currency: "SAR", acceptOrders: false,
        });

        expect(result).toMatchObject({label: "Renamed", deliveryFee: 250, currency: "SAR", acceptOrders: false});
    })

    it("rejects an empty label when provided", async () => {
        await expect(validateBody(UpdateBranchDTO, {label: ""})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a negative deliveryFee", async () => {
        await expect(validateBody(UpdateBranchDTO, {deliveryFee: -1})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a non-boolean acceptOrders", async () => {
        await expect(validateBody(UpdateBranchDTO, {acceptOrders: "yes"})).rejects.toMatchObject({statusCode: 400});
    })
})

describe("UpdateBranchStatusDTO", () => {
    it("accepts an empty payload", async () => {
        await expect(validateBody(UpdateBranchStatusDTO, {})).resolves.toBeInstanceOf(UpdateBranchStatusDTO);
    })

    it("accepts isActive and commission within 0-100", async () => {
        await expect(validateBody(UpdateBranchStatusDTO, {isActive: true, commission: 15}))
            .resolves.toMatchObject({isActive: true, commission: 15});
    })

    it("rejects a commission above 100", async () => {
        await expect(validateBody(UpdateBranchStatusDTO, {commission: 101})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a negative commission", async () => {
        await expect(validateBody(UpdateBranchStatusDTO, {commission: -1})).rejects.toMatchObject({statusCode: 400});
    })
})
