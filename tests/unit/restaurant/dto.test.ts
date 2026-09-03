import "reflect-metadata"
import {validateBody} from "../../../src/lib/validation/validate";
import {CreateRestaurantDTO, UpdateRestaurantDTO, UpdateRestaurantStatusDTO} from "../../../src/app/restaurant/dto/restaurant.dto";

const STRONG_PASSWORD = "StrongPass1!";

const validCreate = {
    owner: {email: "owner@example.com", phone: "01012345678", name: "Owner", password: STRONG_PASSWORD},
    name: "Tasty Bites", primaryCountry: "eg",
};

describe("CreateRestaurantDTO", () => {
    it("accepts a valid payload", async () => {
        await expect(validateBody(CreateRestaurantDTO, validCreate)).resolves.toBeInstanceOf(CreateRestaurantDTO);
    })

    it("accepts an optional logoUrl", async () => {
        const result = await validateBody(CreateRestaurantDTO, {...validCreate, logoUrl: "http://x/logo.png"});

        expect(result.logoUrl).toBe("http://x/logo.png");
    })

    // Regression test for notes.md §4: `@ValidateNested()` alone doesn't
    // require `owner` to be present, so a missing owner used to pass
    // validation and crash downstream with a raw TypeError -> generic 500
    // instead of a clean 400. `@IsDefined()` on `owner` fixes that.
    it("rejects a payload with owner entirely missing", async () => {
        const {owner, ...rest} = validCreate;
        await expect(validateBody(CreateRestaurantDTO, rest)).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects an invalid nested owner email", async () => {
        await expect(validateBody(CreateRestaurantDTO, {...validCreate, owner: {...validCreate.owner, email: "bad"}}))
            .rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a weak nested owner password", async () => {
        await expect(validateBody(CreateRestaurantDTO, {...validCreate, owner: {...validCreate.owner, password: "weak"}}))
            .rejects.toMatchObject({statusCode: 400});
    })

    it("rejects an empty name", async () => {
        await expect(validateBody(CreateRestaurantDTO, {...validCreate, name: ""})).rejects.toMatchObject({statusCode: 400});
    })
})

describe("UpdateRestaurantDTO", () => {
    it("accepts an empty payload (every field optional)", async () => {
        await expect(validateBody(UpdateRestaurantDTO, {})).resolves.toBeInstanceOf(UpdateRestaurantDTO);
    })

    it("accepts every optional field at once", async () => {
        const result = await validateBody(UpdateRestaurantDTO, {name: "Renamed", logoUrl: "http://x/y.png", primaryCountry: "sa"});

        expect(result).toMatchObject({name: "Renamed", logoUrl: "http://x/y.png", primaryCountry: "sa"});
    })

    it("rejects an empty name when provided", async () => {
        await expect(validateBody(UpdateRestaurantDTO, {name: ""})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects an empty primaryCountry when provided", async () => {
        await expect(validateBody(UpdateRestaurantDTO, {primaryCountry: ""})).rejects.toMatchObject({statusCode: 400});
    })
})

describe("UpdateRestaurantStatusDTO", () => {
    it("accepts a status in the RestaurantStatus enum", async () => {
        await expect(validateBody(UpdateRestaurantStatusDTO, {status: "suspended"})).resolves.toMatchObject({status: "suspended"});
    })

    it("rejects a status outside the enum", async () => {
        await expect(validateBody(UpdateRestaurantStatusDTO, {status: "not_a_real_status"})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a missing status", async () => {
        await expect(validateBody(UpdateRestaurantStatusDTO, {})).rejects.toMatchObject({statusCode: 400});
    })
})
