import "reflect-metadata"
import {validateBody} from "../../../src/lib/validation/validate";
import {CreateProductDTO, UpdateProductDTO} from "../../../src/app/product/dto/product.dto";

describe("CreateProductDTO", () => {
    it("accepts just a name (everything else optional)", async () => {
        await expect(validateBody(CreateProductDTO, {name: "Pizza"})).resolves.toBeInstanceOf(CreateProductDTO);
    })

    it("accepts description/imageUrl/categoryName", async () => {
        const result = await validateBody(CreateProductDTO, {
            name: "Pizza", description: "cheesy", imageUrl: "http://x/y.png", categoryName: "Mains",
        });

        expect(result).toMatchObject({description: "cheesy", categoryName: "Mains"});
    })

    it("rejects a missing name", async () => {
        await expect(validateBody(CreateProductDTO, {})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects an empty name", async () => {
        await expect(validateBody(CreateProductDTO, {name: ""})).rejects.toMatchObject({statusCode: 400});
    })
})

describe("UpdateProductDTO", () => {
    it("accepts an empty payload (every field optional)", async () => {
        await expect(validateBody(UpdateProductDTO, {})).resolves.toBeInstanceOf(UpdateProductDTO);
    })

    it("accepts branch-level price/stock/isAvailable overrides", async () => {
        const result = await validateBody(UpdateProductDTO, {price: 1500, stock: 50, isAvailable: true});

        expect(result).toMatchObject({price: 1500, stock: 50, isAvailable: true});
    })

    it("rejects a negative price", async () => {
        await expect(validateBody(UpdateProductDTO, {price: -1})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a non-integer stock", async () => {
        await expect(validateBody(UpdateProductDTO, {stock: 5.5})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a non-boolean isAvailable", async () => {
        await expect(validateBody(UpdateProductDTO, {isAvailable: "yes"})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects an empty name when provided", async () => {
        await expect(validateBody(UpdateProductDTO, {name: ""})).rejects.toMatchObject({statusCode: 400});
    })
})
