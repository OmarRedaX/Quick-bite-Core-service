import knexFactory from "knex";
import {applyCursorPagination, applyFilters, buildPaginationResult, PaginationParams, FilterParams} from "../../../src/lib/http/pagination/cursor-pagination";

// A client-only knex instance (no live connection) so we can inspect the
// generated SQL/bindings without a database.
const knex = knexFactory({client: "pg"});

describe("applyCursorPagination", () => {
    it("orders and limits by sortBy+1 with no cursor", () => {
        const params: PaginationParams = {limit: 10, sortBy: "createdAt", sortOrder: "asc"};
        const {sql, bindings} = knex("restaurants").modify((q) => applyCursorPagination(q, params)).toSQL();

        expect(sql).toMatch(/order by "created_at" asc/i);
        expect(sql).toMatch(/limit/i);
        expect(bindings).toEqual([11]);
    })

    it("passes a real Date object (not a string) for an ISO-datetime cursor", () => {
        // Regression: comparing a 'Z'-suffixed ISO string against a `timestamp`
        // (no tz) Postgres column shifts the value through the session
        // TimeZone on cast, corrupting the comparison whenever that timezone
        // isn't UTC. Binding a JS Date instead round-trips correctly.
        const params: PaginationParams = {limit: 10, sortBy: "createdAt", sortOrder: "asc", cursor: "2026-09-03T00:49:41.704Z"};
        const {bindings} = knex("restaurants").modify((q) => applyCursorPagination(q, params)).toSQL();

        const cursorBinding = bindings.find((b: unknown) => b instanceof Date);
        expect(cursorBinding).toBeInstanceOf(Date);
        expect((cursorBinding as Date).toISOString()).toBe("2026-09-03T00:49:41.704Z");
    })

    it("passes non-ISO cursors through unchanged (e.g. sorting by a string/id column)", () => {
        const params: PaginationParams = {limit: 10, sortBy: "name", sortOrder: "asc", cursor: "Tasty Bites"};
        const {bindings} = knex("restaurants").modify((q) => applyCursorPagination(q, params)).toSQL();

        expect(bindings).toContain("Tasty Bites");
    })

    it("uses < for descending order", () => {
        const params: PaginationParams = {limit: 5, sortBy: "createdAt", sortOrder: "desc", cursor: "2026-09-03T00:49:41.704Z"};
        const {sql} = knex("restaurants").modify((q) => applyCursorPagination(q, params)).toSQL();

        expect(sql).toMatch(/"created_at" < \?/);
        expect(sql).toMatch(/order by "created_at" desc/i);
    })

    it("returns the query unchanged when sortBy is empty", () => {
        const params: PaginationParams = {limit: 10, sortBy: "", sortOrder: "asc"};
        const {sql} = knex("restaurants").modify((q) => applyCursorPagination(q, params)).toSQL();

        expect(sql).toBe('select * from "restaurants"');
    })
})

describe("applyFilters", () => {
    const cases: [FilterParams["operator"], string][] = [
        ["eq", "="],
        ["gt", ">"],
        ["lt", "<"],
        ["gte", ">="],
        ["lte", "<="],
    ];

    it.each(cases)("applies the %s operator as SQL %s", (operator, sqlOperator) => {
        const filters: FilterParams[] = [{field: "status", operator, value: "active"}];
        const {sql} = knex("restaurants").modify((q) => applyFilters(q, filters)).toSQL();

        expect(sql).toContain(`"status" ${sqlOperator} ?`);
    })

    it("applies like with wildcards", () => {
        const filters: FilterParams[] = [{field: "name", operator: "like", value: "burger"}];
        const {sql, bindings} = knex("restaurants").modify((q) => applyFilters(q, filters)).toSQL();

        expect(sql.toLowerCase()).toContain("like");
        expect(bindings).toContain("%burger%");
    })

    it("applies in with an array of values", () => {
        const filters: FilterParams[] = [{field: "id", operator: "in", value: ["1", "2", "3"]}];
        const {bindings} = knex("restaurants").modify((q) => applyFilters(q, filters)).toSQL();

        expect(bindings).toEqual(["1", "2", "3"]);
    })

    it("wraps a scalar value in an array for in", () => {
        const filters: FilterParams[] = [{field: "id", operator: "in", value: "1"}];
        const {bindings} = knex("restaurants").modify((q) => applyFilters(q, filters)).toSQL();

        expect(bindings).toEqual(["1"]);
    })

    it("applies multiple filters as separate AND clauses", () => {
        const filters: FilterParams[] = [
            {field: "status", operator: "eq", value: "active"},
            {field: "name", operator: "like", value: "pizza"},
        ];
        const {sql} = knex("restaurants").modify((q) => applyFilters(q, filters)).toSQL();

        expect(sql).toContain("and");
    })
})

describe("buildPaginationResult", () => {
    it("returns hasMore=false and nextCursor=null when rows fit within the limit", () => {
        const rows = [{id: 1, createdAt: new Date("2026-01-01")}];
        const result = buildPaginationResult(rows, 10, "createdAt");

        expect(result.meta.hasMore).toBe(false);
        expect(result.meta.nextCursor).toBeNull();
        expect(result.data).toHaveLength(1);
    })

    it("trims to limit and sets hasMore=true when there's an extra row", () => {
        const rows = [{id: 1}, {id: 2}, {id: 3}];
        const result = buildPaginationResult(rows, 2, "id");

        expect(result.data).toHaveLength(2);
        expect(result.meta.hasMore).toBe(true);
        expect(result.meta.count).toBe(2);
    })

    it("serializes a Date cursor value as ISO", () => {
        const date = new Date("2026-05-01T12:00:00.000Z");
        const rows = [{id: 1, createdAt: date}, {id: 2, createdAt: date}];
        const result = buildPaginationResult(rows, 1, "createdAt");

        expect(result.meta.nextCursor).toBe(date.toISOString());
    })

    it("serializes a non-Date cursor value with String()", () => {
        const rows = [{id: 1, name: "a"}, {id: 2, name: "b"}];
        const result = buildPaginationResult(rows, 1, "name");

        expect(result.meta.nextCursor).toBe("a");
    })

    it("returns an empty result for zero rows", () => {
        const result = buildPaginationResult([], 10, "id");

        expect(result.data).toEqual([]);
        expect(result.meta).toEqual({nextCursor: null, hasMore: false, count: 0});
    })
})
