import "reflect-metadata"
import {validateBody} from "../../../src/lib/validation/validate";
import {CreateMemberDTO, UpdateMemberDTO, UpdateMemberBranchesDTO} from "../../../src/app/rbac/dto/member.dto";

describe("CreateMemberDTO", () => {
    it("accepts a valid payload without branchIds", async () => {
        await expect(validateBody(CreateMemberDTO, {
            email: "staff@example.com", name: "Staff", phoneNumber: "01012345678", role: "staff",
        })).resolves.toBeInstanceOf(CreateMemberDTO);
    })

    it("accepts branchIds when provided", async () => {
        const result = await validateBody(CreateMemberDTO, {
            email: "staff@example.com", name: "Staff", phoneNumber: "01012345678", role: "staff", branchIds: [1, 2],
        });

        expect(result.branchIds).toEqual([1, 2]);
    })

    it("rejects an invalid email", async () => {
        await expect(validateBody(CreateMemberDTO, {
            email: "not-an-email", name: "Staff", phoneNumber: "01012345678", role: "staff",
        })).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a missing role", async () => {
        await expect(validateBody(CreateMemberDTO, {
            email: "staff@example.com", name: "Staff", phoneNumber: "01012345678",
        })).rejects.toMatchObject({statusCode: 400});
    })
})

describe("UpdateMemberDTO", () => {
    it("accepts an empty payload (every field optional)", async () => {
        await expect(validateBody(UpdateMemberDTO, {})).resolves.toBeInstanceOf(UpdateMemberDTO);
    })

    it("accepts role alone", async () => {
        await expect(validateBody(UpdateMemberDTO, {role: "branch_manager"})).resolves.toMatchObject({role: "branch_manager"});
    })

    it("accepts a status in the allowed set", async () => {
        await expect(validateBody(UpdateMemberDTO, {status: "suspended"})).resolves.toMatchObject({status: "suspended"});
    })

    it("rejects a status outside the allowed set", async () => {
        await expect(validateBody(UpdateMemberDTO, {status: "on_vacation"})).rejects.toMatchObject({statusCode: 400});
    })
})

describe("UpdateMemberBranchesDTO", () => {
    it("accepts an array of branchIds", async () => {
        await expect(validateBody(UpdateMemberBranchesDTO, {branchIds: [1, 2, 3]}))
            .resolves.toMatchObject({branchIds: [1, 2, 3]});
    })

    it("accepts an empty array (clearing all branch assignments)", async () => {
        await expect(validateBody(UpdateMemberBranchesDTO, {branchIds: []}))
            .resolves.toMatchObject({branchIds: []});
    })

    it("rejects a missing branchIds field", async () => {
        await expect(validateBody(UpdateMemberBranchesDTO, {})).rejects.toMatchObject({statusCode: 400});
    })

    it("rejects a non-array branchIds", async () => {
        await expect(validateBody(UpdateMemberBranchesDTO, {branchIds: "1,2,3"})).rejects.toMatchObject({statusCode: 400});
    })
})
