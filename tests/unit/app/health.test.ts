import express from "express";
import request from "supertest";

jest.mock("../../../src/lib/knex/knex", () => ({
    pingDB: jest.fn(),
}));

import {pingDB} from "../../../src/lib/knex/knex";
import {healthRouter} from "../../../src/app/health/health.routes";

const app = express();
app.use("/health", healthRouter);

describe("GET /health", () => {
    it("returns 200 OK when the database is reachable", async () => {
        (pingDB as jest.Mock).mockResolvedValueOnce(undefined);

        const res = await request(app).get("/health");

        expect(res.status).toBe(200);
        expect(res.text).toBe("OK");
    })

    it("returns 500 when the database ping fails", async () => {
        (pingDB as jest.Mock).mockRejectedValueOnce(new Error("connection refused"));

        const res = await request(app).get("/health");

        expect(res.status).toBe(500);
        expect(res.body).toEqual({message: "db down"});
    })
})
