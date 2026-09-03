import "reflect-metadata"
import request from "supertest"
import {emailstub} from "../../helpers/email-stub";
import {truncateAll} from "../../helpers/db";
import {flushTestCache} from "../../helpers/redis";
import {insertUser, loginAgent, INTERNAL_API_KEY} from "../../helpers/fixtures";

jest.mock("../../../src/lib/email/init", () => ({
    emailProvider: emailstub
}))

import {createApp} from "../../../src/app";
import {db} from "../../../src/lib/knex/knex";

const app = createApp();

describe("user", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushTestCache();
        emailstub.reset();
    })

    describe("GET /api/user/me", () => {
        it("rejects unauthenticated requests with 401", async () => {
            const res = await request(app).get("/api/user/me");

            expect(res.status).toBe(401);
        })

        it("returns the authenticated user's own profile", async () => {
            const user = await insertUser({systemRole: "customer"});
            const agent = await loginAgent(app, user.email);

            const res = await agent.get("/api/user/me");

            expect(res.status).toBe(200);
            expect(res.body.data.email).toBe(user.email);
        })

        it("rejects a garbage JWT in the access_token cookie with 4xx, not a 500", async () => {
            const res = await request(app).get("/api/user/me").set("Cookie", "access_token=not.a.valid.jwt");

            expect(res.status).toBeGreaterThanOrEqual(400);
            expect(res.status).toBeLessThan(500);
        })

        it("rejects a well-formed but invalid-signature JWT with 4xx, not authenticated as admin", async () => {
            const fakeJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInJvbGUiOiJzeXN0ZW1fYWRtaW4ifQ.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

            const res = await request(app).get("/api/user/me").set("Cookie", `access_token=${fakeJwt}`);

            expect(res.status).toBeGreaterThanOrEqual(400);
            expect(res.status).toBeLessThan(500);
        })
    })

    describe("PATCH /api/user/me", () => {
        it("updates the caller's own name", async () => {
            const user = await insertUser({systemRole: "customer"});
            const agent = await loginAgent(app, user.email);

            const res = await agent.patch("/api/user/me").send({name: "Updated Name"});

            expect(res.status).toBe(200);
            const row = await db("users").where("id", user.id).first();
            expect(row.name).toBe("Updated Name");
        })

        it("rejects an empty name with 400", async () => {
            const user = await insertUser({systemRole: "customer"});
            const agent = await loginAgent(app, user.email);

            const res = await agent.patch("/api/user/me").send({name: ""});

            expect(res.status).toBe(400);
        })
    })

    describe("GET /api/user/internal/agents/:id", () => {
        it("rejects a missing api-key with 401", async () => {
            const res = await request(app).get("/api/user/internal/agents/1");

            expect(res.status).toBe(401);
        })

        it("returns 404 for an existing user who is not a delivery_agent (no enumeration)", async () => {
            const user = await insertUser({systemRole: "customer"});

            const res = await request(app).get(`/api/user/internal/agents/${user.id}`).set("api-key", INTERNAL_API_KEY);

            expect(res.status).toBe(404);
        })

        it("returns 404 for a nonexistent user (same as a non-agent user, no enumeration)", async () => {
            const res = await request(app).get("/api/user/internal/agents/999999999").set("api-key", INTERNAL_API_KEY);

            expect(res.status).toBe(404);
        })

        it("returns the agent for an actual delivery_agent user", async () => {
            const agentUser = await insertUser({systemRole: "delivery_agent"});

            const res = await request(app).get(`/api/user/internal/agents/${agentUser.id}`).set("api-key", INTERNAL_API_KEY);

            expect(res.status).toBe(200);
            expect(res.body.data.id).toBe(agentUser.id);
        })
    })
})
