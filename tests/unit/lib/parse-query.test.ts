import {parsePaginationQuery, parseFilters} from "../../../src/lib/http/pagination/parse-query";

describe("parsePaginationQuery", () => {
    it("falls back to the default sortBy when the requested one isn't allowed", () => {
        const params = parsePaginationQuery({sortBy: "secretColumn"}, ["createdAt", "name"]);

        expect(params.sortBy).toBe("createdAt");
    })

    it("keeps an allowed sortBy", () => {
        const params = parsePaginationQuery({sortBy: "name"}, ["createdAt", "name"]);

        expect(params.sortBy).toBe("name");
    })

    it("defaults sortOrder to asc for anything other than 'desc'", () => {
        expect(parsePaginationQuery({}, []).sortOrder).toBe("asc");
        expect(parsePaginationQuery({sortOrder: "sideways"}, []).sortOrder).toBe("asc");
    })

    it("accepts sortOrder=desc", () => {
        expect(parsePaginationQuery({sortOrder: "desc"}, []).sortOrder).toBe("desc");
    })

    it("caps limit at 1000", () => {
        expect(parsePaginationQuery({limit: "5000"}, []).limit).toBe(1000);
    })
})

describe("parseFilters", () => {
    it("returns an empty array when there's no filter object at all", () => {
        expect(parseFilters({}, ["status"])).toEqual([]);
    })

    it("returns an empty array when filter is present but not an object", () => {
        expect(parseFilters({filter: "not-an-object"}, ["status"])).toEqual([]);
    })

    it("ignores a field that isn't in allowedFields", () => {
        expect(parseFilters({filter: {secret: {eq: "x"}}}, ["status"])).toEqual([]);
    })

    it("ignores an operator that isn't in the allowed operator set", () => {
        expect(parseFilters({filter: {status: {ne: "x"}}}, ["status"])).toEqual([]);
    })

    it("parses a valid field+operator into FilterParams", () => {
        expect(parseFilters({filter: {status: {eq: "active"}}}, ["status"])).toEqual([
            {field: "status", operator: "eq", value: "active"},
        ]);
    })
})
