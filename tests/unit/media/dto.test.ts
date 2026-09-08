import "reflect-metadata"
import {validateBody} from "../../../src/lib/validation/validate";
import {CreateUploadDTO} from "../../../src/app/media/dto/media.dto";

describe("CreateUploadDTO", () => {
    it("accepts just a contentType (everything else optional)", async () => {
        await expect(validateBody(CreateUploadDTO, {contentType: "image/png"})).resolves.toBeInstanceOf(CreateUploadDTO);
    })

    it("accepts fileName and restaurantId", async () => {
        const result = await validateBody(CreateUploadDTO, {
            contentType: "image/jpeg", fileName: "burger.jpg", restaurantId: 7,
        });

        expect(result).toMatchObject({contentType: "image/jpeg", fileName: "burger.jpg", restaurantId: 7});
    })

    it("rejects a missing contentType", async () => {
        await expect(validateBody(CreateUploadDTO, {fileName: "burger.jpg"})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects an empty contentType", async () => {
        await expect(validateBody(CreateUploadDTO, {contentType: ""})).rejects.toMatchObject({statusCode: 400});
    })

    it("accepts a restaurantId sent as a numeric string, as this API's own ids come back", async () => {
        const result = await validateBody(CreateUploadDTO, {contentType: "image/png", restaurantId: "7"});

        expect(result.restaurantId).toBe(7);
    })

    it("rejects a non-integer restaurantId", async () => {
        await expect(validateBody(CreateUploadDTO, {contentType: "image/png", restaurantId: "abc"})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a restaurantId below 1", async () => {
        await expect(validateBody(CreateUploadDTO, {contentType: "image/png", restaurantId: 0})).rejects.toMatchObject({statusCode: 400});
    })
})
