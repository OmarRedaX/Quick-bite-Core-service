import "reflect-metadata"
import request from "supertest"
import {emailstub} from "../../helpers/email-stub";
import {truncateAll} from "../../helpers/db";
import {flushTestCache} from "../../helpers/redis";
import {adminSession, insertUser, loginAgent, createActiveRestaurantWithOwner, inviteAndActivateMember, uniqueEmail, uniquePhone, STRONG_PASSWORD} from "../../helpers/fixtures";

jest.mock("../../../src/lib/email/init", () => ({
    emailProvider: emailstub
}))

import {createApp} from "../../../src/app";
import {db} from "../../../src/lib/knex/knex";

const app = createApp();

const admin = () => adminSession(app);

describe("restaurant", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushTestCache();
        emailstub.reset();
    })

    describe("GET /api/restaurants", () => {
        it("lists restaurants publicly with pagination meta", async () => {
            const {agent} = await admin();
            await createActiveRestaurantWithOwner(app, agent);

            const res = await request(app).get("/api/restaurants");

            expect(res.status).toBe(200);
            expect(res.body.meta).toEqual(expect.objectContaining({hasMore: expect.any(Boolean), count: expect.any(Number)}));
        })

        it("does not 500 when no limit query param is given", async () => {
            const res = await request(app).get("/api/restaurants");

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data)).toBe(true);
        })

        it("caps the page at the requested limit", async () => {
            const {agent} = await admin();
            await createActiveRestaurantWithOwner(app, agent);
            await createActiveRestaurantWithOwner(app, agent);

            const res = await request(app).get("/api/restaurants?limit=1");

            expect(res.status).toBe(200);
            expect(res.body.data.length).toBeLessThanOrEqual(1);
        })

        it("filters by status", async () => {
            const {agent} = await admin();
            const {restaurant: active} = await createActiveRestaurantWithOwner(app, agent, {name: "Active One"});
            const {restaurant: toSuspend} = await createActiveRestaurantWithOwner(app, agent, {name: "Suspend Me"});
            await agent.patch(`/api/restaurants/${toSuspend.id}/status`).send({status: "suspended"});

            const res = await request(app).get("/api/restaurants?filter[status][eq]=suspended");

            expect(res.status).toBe(200);
            expect(res.body.data.every((r: any) => r.status === "suspended")).toBe(true);
            expect(res.body.data.some((r: any) => r.id === toSuspend.id)).toBe(true);
            expect(res.body.data.some((r: any) => r.id === active.id)).toBe(false);
        })
    })

    describe("GET /api/restaurants/:id", () => {
        it("returns 404 for a nonexistent id", async () => {
            const res = await request(app).get("/api/restaurants/999999999");

            expect(res.status).toBe(404);
        })

        it("returns 400 (not 500) for a non-numeric id", async () => {
            const res = await request(app).get("/api/restaurants/not-a-number");

            expect(res.status).toBe(400);
        })

        it("returns the restaurant by id", async () => {
            const {agent} = await admin();
            const {restaurant} = await createActiveRestaurantWithOwner(app, agent, {name: "Findable"});

            const res = await request(app).get(`/api/restaurants/${restaurant.id}`);

            expect(res.status).toBe(200);
            expect(res.body.data.name).toBe("Findable");
        })
    })

    describe("POST /api/restaurants (admin-only)", () => {
        it("rejects unauthenticated requests with 401", async () => {
            const res = await request(app).post("/api/restaurants").send({});

            expect(res.status).toBe(401);
        })

        it("rejects a non-admin caller with 403", async () => {
            const customer = await insertUser({systemRole: "customer"});
            const agent = await loginAgent(app, customer.email);

            const res = await agent.post("/api/restaurants").send({
                owner: {email: uniqueEmail(), phone: uniquePhone(), name: "X", password: STRONG_PASSWORD},
                name: "Should Not Create",
                primaryCountry: "eg",
            });

            expect(res.status).toBe(403);
            expect(res.body.error).toBe("User not authorised");
        })

        it("creates a restaurant with an active status as admin", async () => {
            const {agent} = await admin();

            const res = await agent.post("/api/restaurants").send({
                owner: {email: uniqueEmail(), phone: uniquePhone(), name: "Owner", password: STRONG_PASSWORD},
                name: "Restaurant A",
                primaryCountry: "eg",
            });

            expect(res.status).toBe(201);
            expect(res.body.data.restaurant.status).toBe("active");
        })

        it("rejects an invalid nested owner DTO with 400", async () => {
            const {agent} = await admin();

            const res = await agent.post("/api/restaurants").send({
                owner: {email: "bad-email", phone: "1", name: "", password: "weak"},
                name: "",
                primaryCountry: "",
            });

            expect(res.status).toBe(400);
        })

        // Regression test for notes.md §4: a missing `owner` used to pass
        // DTO validation and crash `RestaurantService.createWithOwner` with
        // an uncaught TypeError, surfacing as a generic 500 instead of 400.
        it("rejects a payload with owner entirely missing with 400 (not 500)", async () => {
            const {agent} = await admin();

            const res = await agent.post("/api/restaurants").send({
                name: "No Owner Here",
                primaryCountry: "eg",
            });

            expect(res.status).toBe(400);
        })
    })

    describe("PATCH /api/restaurants/:id", () => {
        it("allows the owner to update their own restaurant", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerAgent.patch(`/api/restaurants/${restaurant.id}`).send({name: "Renamed"});

            expect(res.status).toBe(200);
            expect(res.body.data.restaurant.name).toBe("Renamed");
        })

        it("rejects an update from a different restaurant's owner with 403", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant: restA} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {ownerAgent: ownerBAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerBAgent.patch(`/api/restaurants/${restA.id}`).send({name: "Hijacked"});

            expect(res.status).toBe(403);
        })

        it("returns 404 for a nonexistent restaurant", async () => {
            const {agent: adminAgent} = await admin();

            const res = await adminAgent.patch("/api/restaurants/999999999").send({name: "Ghost"});

            expect(res.status).toBe(404);
        })

        it("rejects a member holding the 'owner' role who isn't the restaurant's literal owner (defense-in-depth, service-level check)", async () => {
            // requireRestaurantMember only checks restaurantId equality, and the
            // 'owner' role (grantable to a second member via updateMember) holds
            // every permission -- restaurant.service.ts's own ownerId check is the
            // only thing stopping a promoted-but-not-literal-owner member here.
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {memberId, email, password} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "staff"});
            await ownerAgent.patch(`/api/restaurants/${restaurant.id}/members/${memberId}`).send({role: "owner"});
            // re-login: the JWT issued right after accept-invite still carries the pre-promotion role
            const promotedAgent = await loginAgent(app, email, password);

            const res = await promotedAgent.patch(`/api/restaurants/${restaurant.id}`).send({name: "Hijacked by promoted owner"});

            expect(res.status).toBe(403);
        })
    })

    describe("PATCH /api/restaurants/:id/status (admin-only)", () => {
        it("rejects a non-admin owner with 403", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerAgent.patch(`/api/restaurants/${restaurant.id}/status`).send({status: "suspended"});

            expect(res.status).toBe(403);
        })

        it("allows an admin to suspend and reactivate", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant} = await createActiveRestaurantWithOwner(app, adminAgent);

            const suspend = await adminAgent.patch(`/api/restaurants/${restaurant.id}/status`).send({status: "suspended"});
            expect(suspend.status).toBe(200);
            expect(suspend.body.data.restaurant.status).toBe("suspended");

            const reactivate = await adminAgent.patch(`/api/restaurants/${restaurant.id}/status`).send({status: "active"});
            expect(reactivate.status).toBe(200);
            expect(reactivate.body.data.restaurant.status).toBe("active");
        })

        it("writes an outbox event when suspending", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant} = await createActiveRestaurantWithOwner(app, adminAgent);

            await adminAgent.patch(`/api/restaurants/${restaurant.id}/status`).send({status: "suspended"});

            const event = await db("events_outbox")
                .where("aggregate_type", "restaurants")
                .andWhere("aggregate_id", String(restaurant.id))
                .first();
            expect(event).toBeTruthy();
        })

        it("returns 404 for a nonexistent restaurant", async () => {
            const {agent: adminAgent} = await admin();

            const res = await adminAgent.patch("/api/restaurants/999999999/status").send({status: "suspended"});

            expect(res.status).toBe(404);
        })

        it("rejects an invalid status enum with 400", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await adminAgent.patch(`/api/restaurants/${restaurant.id}/status`).send({status: "not_a_real_status"});

            expect(res.status).toBe(400);
        })
    })

    describe("cursor pagination", () => {
        it("returns a different item on page 2 using the cursor from page 1", async () => {
            const {agent} = await admin();
            await createActiveRestaurantWithOwner(app, agent);
            await createActiveRestaurantWithOwner(app, agent);

            const page1 = await request(app).get("/api/restaurants?limit=1&sortBy=createdAt&sortOrder=asc");
            expect(page1.body.data.length).toBe(1);
            const cursor = page1.body.meta.nextCursor;
            expect(cursor).toBeTruthy();

            const page2 = await request(app).get(`/api/restaurants?limit=1&sortBy=createdAt&sortOrder=asc&cursor=${encodeURIComponent(cursor)}`);
            expect(page2.status).toBe(200);
            expect(page2.body.data[0].id).not.toBe(page1.body.data[0].id);
            expect(page2.body.meta.hasMore).toBe(false);
        })
    })
})
