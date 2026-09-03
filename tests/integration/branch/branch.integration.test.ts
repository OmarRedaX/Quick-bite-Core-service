import "reflect-metadata"
import request from "supertest"
import {emailstub} from "../../helpers/email-stub";
import {truncateAll} from "../../helpers/db";
import {flushTestCache} from "../../helpers/redis";
import {
    adminSession, createActiveRestaurantWithOwner, createBranch,
    inviteAndActivateMember, INTERNAL_API_KEY,
} from "../../helpers/fixtures";

jest.mock("../../../src/lib/email/init", () => ({
    emailProvider: emailstub
}))

import {createApp} from "../../../src/app";
import {db} from "../../../src/lib/knex/knex";

const app = createApp();

const admin = () => adminSession(app);

async function activate(adminAgent: ReturnType<typeof request.agent>, branchId: number) {
    await adminAgent.patch(`/api/branches/${branchId}/status`).send({isActive: true});
}

describe("branch", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushTestCache();
        emailstub.reset();
    })

    describe("POST /api/restaurants/:restaurantId/branches", () => {
        it("allows the owner to create a branch", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerAgent.post(`/api/restaurants/${restaurant.id}/branches`).send({
                countryCode: "EG", label: "Downtown", addressText: "1 Main St",
                lat: 30.05, lng: 31.24, opensAt: "09:00", closesAt: "22:00",
                deliveryRadius: 5, currency: "EGP",
            });

            expect(res.status).toBe(201);
            expect(res.body.data.branch.currency).toBe("EGP");
            expect(res.body.data.branch.isActive).toBe(false);
        })

        it("rejects a different restaurant's owner with 403", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant: restA} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {ownerAgent: ownerBAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerBAgent.post(`/api/restaurants/${restA.id}/branches`).send({
                countryCode: "EG", label: "Should Fail", addressText: "x",
                lat: 30, lng: 31, opensAt: "09:00", closesAt: "22:00",
                deliveryRadius: 5, currency: "EGP",
            });

            expect(res.status).toBe(403);
        })

        it("rejects an invalid currency enum with 400", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerAgent.post(`/api/restaurants/${restaurant.id}/branches`).send({
                countryCode: "EG", label: "Bad Currency", addressText: "x",
                lat: 30, lng: 31, opensAt: "09:00", closesAt: "22:00",
                deliveryRadius: 5, currency: "USD",
            });

            expect(res.status).toBe(400);
        })
    })

    describe("GET /api/branches/nearby", () => {
        it("returns nearby active branches of active restaurants and caches the response", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id, {lat: 30.0444, lng: 31.2357, deliveryRadius: 10});
            await activate(adminAgent, branch.id);

            const first = await request(app).get("/api/branches/nearby?lat=30.0444&lng=31.2357");
            expect(first.status).toBe(200);
            expect(first.headers["x-cache"]).toBe("MISS");
            expect(first.body.data.some((b: any) => Number(b.id) === Number(branch.id))).toBe(true);

            const second = await request(app).get("/api/branches/nearby?lat=30.0444&lng=31.2357");
            expect(second.headers["x-cache"]).toBe("HIT");
        })

        it("excludes an inactive branch", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id, {lat: 30.0444, lng: 31.2357, deliveryRadius: 10});
            // left inactive (default)

            const res = await request(app).get("/api/branches/nearby?lat=30.0444&lng=31.2357");

            expect(res.body.data.some((b: any) => Number(b.id) === Number(branch.id))).toBe(false);
        })
    })

    describe("GET /api/restaurants/:restaurantId/branches", () => {
        it("lists a restaurant's branches publicly", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);

            const res = await request(app).get(`/api/restaurants/${restaurant.id}/branches`);

            expect(res.status).toBe(200);
            expect(res.body.data.some((b: any) => Number(b.id) === Number(branch.id))).toBe(true);
        })
    })

    describe("PATCH /api/branches/:id (RBAC scoping)", () => {
        it("allows the owner to update their own branch", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);

            const res = await ownerAgent.patch(`/api/branches/${branch.id}`).send({label: "Renamed"});

            expect(res.status).toBe(200);
            expect(res.body.data.branch.label).toBe("Renamed");
        })

        it("updates every optional field at once", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);

            const res = await ownerAgent.patch(`/api/branches/${branch.id}`).send({
                addressText: "2 New St", lat: 30.1, lng: 31.1, opensAt: "07:00", closesAt: "23:59",
                deliveryRadius: 8, deliveryFee: 250, currency: "SAR", acceptOrders: false,
            });

            expect(res.status).toBe(200);
            expect(res.body.data.branch).toMatchObject({
                addressText: "2 New St", deliveryRadius: 8, deliveryFee: 250, currency: "SAR", acceptOrders: false,
            });
        })

        it("allows a branch_manager to update a branch they are assigned to", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);
            const {agent: bmAgent} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "branch_manager", branchIds: [branch.id]});

            const res = await bmAgent.patch(`/api/branches/${branch.id}`).send({label: "By BM"});

            expect(res.status).toBe(200);
        })

        it("rejects a branch_manager updating a branch they are NOT assigned to (branch scoping)", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branchAssigned = await createBranch(ownerAgent, restaurant.id, {label: "Assigned"});
            const branchOther = await createBranch(ownerAgent, restaurant.id, {label: "Other"});
            const {agent: bmAgent} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "branch_manager", branchIds: [branchAssigned.id]});

            const res = await bmAgent.patch(`/api/branches/${branchOther.id}`).send({label: "Hijack"});

            expect(res.status).toBe(403);
        })

        it("rejects staff (no core:branch:update permission) even on an assigned branch", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);
            const {agent: staffAgent} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "staff", branchIds: [branch.id]});

            const res = await staffAgent.patch(`/api/branches/${branch.id}`).send({label: "Hijack"});

            expect(res.status).toBe(403);
        })

        it("rejects a different restaurant's owner (cross-restaurant isolation)", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant: restA, ownerAgent: ownerAAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {ownerAgent: ownerBAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branchA = await createBranch(ownerAAgent, restA.id);

            const res = await ownerBAgent.patch(`/api/branches/${branchA.id}`).send({label: "Hijacked by owner B"});

            expect(res.status).toBe(403);
        })

        it("rejects a branch_manager from a different restaurant", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant: restA, ownerAgent: ownerAAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {restaurant: restB, ownerAgent: ownerBAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branchA = await createBranch(ownerAAgent, restA.id);
            const branchB = await createBranch(ownerBAgent, restB.id);
            const {agent: bmAgent} = await inviteAndActivateMember(app, ownerAAgent, restA.id, {role: "branch_manager", branchIds: [branchA.id]});

            const res = await bmAgent.patch(`/api/branches/${branchB.id}`).send({label: "Cross-restaurant hijack"});

            expect(res.status).toBe(403);
        })

        it("busts the internal branch cache after an update", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id, {label: "Cache Branch"});

            const first = await request(app).get(`/api/internal/branches/${branch.id}`).set("api-key", INTERNAL_API_KEY);
            expect(first.headers["x-cache"]).toBe("MISS");
            const cached = await request(app).get(`/api/internal/branches/${branch.id}`).set("api-key", INTERNAL_API_KEY);
            expect(cached.headers["x-cache"]).toBe("HIT");

            await ownerAgent.patch(`/api/branches/${branch.id}`).send({label: "Renamed For Cache Test"});

            const afterUpdate = await request(app).get(`/api/internal/branches/${branch.id}`).set("api-key", INTERNAL_API_KEY);
            expect(afterUpdate.headers["x-cache"]).toBe("MISS");
            expect(afterUpdate.body.data.name).toBe("Renamed For Cache Test");
        })

        it("writes an outbox event on update", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);

            await ownerAgent.patch(`/api/branches/${branch.id}`).send({label: "Triggers Outbox"});

            const event = await db("events_outbox")
                .where("aggregate_type", "restaurant_branches")
                .andWhere("aggregate_id", String(branch.id))
                .first();
            expect(event).toBeTruthy();
        })
    })

    describe("PATCH /api/branches/:id/status (admin-only)", () => {
        it("rejects a non-admin owner with 403", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);

            const res = await ownerAgent.patch(`/api/branches/${branch.id}/status`).send({isActive: true});

            expect(res.status).toBe(403);
        })

        it("allows an admin to activate a branch and set commission", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);

            const res = await adminAgent.patch(`/api/branches/${branch.id}/status`).send({isActive: true, commission: 15});

            expect(res.status).toBe(200);
            expect(res.body.data.branch.isActive).toBe(true);
        })

        it("returns 404 for a nonexistent branch", async () => {
            const {agent: adminAgent} = await admin();

            const res = await adminAgent.patch("/api/branches/999999999/status").send({isActive: true});

            expect(res.status).toBe(404);
        })
    })

    describe("internal branch lookups", () => {
        it("rejects a missing api-key with 401", async () => {
            const res = await request(app).get("/api/internal/branches/1");

            expect(res.status).toBe(401);
        })

        it("returns branch details with commissionBps converted from a percent", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);
            await adminAgent.patch(`/api/branches/${branch.id}/status`).send({isActive: true, commission: 12});

            const res = await request(app).get(`/api/internal/branches/${branch.id}`).set("api-key", INTERNAL_API_KEY);

            expect(res.status).toBe(200);
            expect(res.body.data.commissionBps).toBe(1200);
        })

        it("returns 404 for a nonexistent branch", async () => {
            const res = await request(app).get("/api/internal/branches/999999999").set("api-key", INTERNAL_API_KEY);

            expect(res.status).toBe(404);
        })

        it("batch-looks-up branches by ids, silently dropping missing ones", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);

            const res = await request(app).get(`/api/internal/branches?ids=${branch.id},999999999`).set("api-key", INTERNAL_API_KEY);

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(Number(res.body.data[0].id)).toBe(Number(branch.id));
        })

        it("returns an empty array when ids is missing", async () => {
            const res = await request(app).get("/api/internal/branches").set("api-key", INTERNAL_API_KEY);

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual([]);
        })
    })
})
