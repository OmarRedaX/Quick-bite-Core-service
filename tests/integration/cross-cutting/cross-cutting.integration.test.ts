import "reflect-metadata"
import request from "supertest"
import {emailstub} from "../../helpers/email-stub";
import {truncateAll} from "../../helpers/db";
import {flushTestCache} from "../../helpers/redis";
import {uniqueEmail, uniquePhone, STRONG_PASSWORD, insertUser} from "../../helpers/fixtures";

jest.mock("../../../src/lib/email/init", () => ({
    emailProvider: emailstub
}))

import {createApp} from "../../../src/app";
import {db} from "../../../src/lib/knex/knex";

const app = createApp();

describe("cross-cutting", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushTestCache();
        emailstub.reset();
    })

    describe("GET /api/health", () => {
        it("returns 200 OK when the database is reachable", async () => {
            const res = await request(app).get("/api/health");

            expect(res.status).toBe(200);
        })
    })

    describe("authenticate() (guard.ts)", () => {
        it("accepts an Authorization: Bearer <token> header when no cookie is present (service-to-service / mobile / curl clients)", async () => {
            const user = await insertUser({systemRole: "customer"});
            const login = await request(app).post("/api/auth/login").send({email: user.email, password: STRONG_PASSWORD});
            const accessToken = login.body.data.accessToken;

            const res = await request(app).get("/api/user/me").set("Authorization", `Bearer ${accessToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.email).toBe(user.email);
        })

        it("rejects an Authorization header that isn't a Bearer token", async () => {
            const res = await request(app).get("/api/user/me").set("Authorization", "Basic dXNlcjpwYXNz");

            expect(res.status).toBe(401);
        })
    })

    describe("errorHandler", () => {
        it("returns a 4xx (not a 500) for a malformed JSON body", async () => {
            const res = await request(app)
                .post("/api/auth/login")
                .set("Content-Type", "application/json")
                .send("{not valid json");

            expect(res.status).toBeGreaterThanOrEqual(400);
            expect(res.status).toBeLessThan(500);
        })

        it("returns 404 for an unknown route", async () => {
            const res = await request(app).get("/api/this/route/does/not/exist");

            expect(res.status).toBe(404);
        })
    })

    describe("DTO whitelist stripping", () => {
        it("silently strips unexpected fields instead of erroring or applying them", async () => {
            const email = uniqueEmail("whitelist");

            const res = await request(app).post("/api/auth/register").send({
                email, phone: uniquePhone(), name: "Whitelist Test",
                password: STRONG_PASSWORD, role: "customer",
                systemRole: "system_admin", isAdmin: true, extraJunkField: "hacked",
            });

            expect(res.status).toBe(201);
            expect(res.body.data.user.systemRole).toBe("customer");
            const row = await db("users").where("email", email).first();
            expect(row.system_role).toBe("customer");
        })
    })

    describe("idempotency replay", () => {
        it("returns an identical cached response and does not re-run the handler on replay", async () => {
            const email = uniqueEmail("idem");
            await db("users").insert({
                email, phone: uniquePhone(), name: "Idem User", system_role: "customer",
                created_at: new Date(), updated_at: new Date(), password_hash: "x",
            });
            const key = `replay-${Date.now()}`;

            const first = await request(app).post("/api/auth/forget-password").set("Idempotency-Key", key).send({email});
            const second = await request(app).post("/api/auth/forget-password").set("Idempotency-Key", key).send({email});

            expect(first.status).toBe(200);
            expect(second.status).toBe(200);
            expect(second.body).toEqual(first.body);

            const count = await db("password_resets").count("* as n").first();
            expect(count).toEqual({n: "1"});
        })

        it("requires the Idempotency-Key header on the strict forget-password route", async () => {
            const res = await request(app).post("/api/auth/forget-password").send({email: "nobody@example.com"});

            expect(res.status).toBe(400);
        })
    })
})
