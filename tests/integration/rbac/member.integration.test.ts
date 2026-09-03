import "reflect-metadata"
import request from "supertest"
import {emailstub} from "../../helpers/email-stub";
import {truncateAll} from "../../helpers/db";
import {flushTestCache} from "../../helpers/redis";
import {
    adminSession, createActiveRestaurantWithOwner, createBranch,
    inviteAndActivateMember, uniqueEmail, uniquePhone, INTERNAL_API_KEY,
} from "../../helpers/fixtures";

jest.mock("../../../src/lib/email/init", () => ({
    emailProvider: emailstub
}))

import {createApp} from "../../../src/app";
import {db} from "../../../src/lib/knex/knex";

const app = createApp();

const admin = () => adminSession(app);

describe("rbac / member", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushTestCache();
        emailstub.reset();
    })

    describe("GET /api/roles/:role/permissions (public)", () => {
        it("returns owner's full permission set including core:branch:create", async () => {
            const res = await request(app).get("/api/roles/owner/permissions");

            expect(res.status).toBe(200);
            expect(res.body.data.permissions.some((p: any) => p.permission === "core:branch:create")).toBe(true);
        })

        it("returns staff's read-only product permission, not create", async () => {
            const res = await request(app).get("/api/roles/staff/permissions");

            const perms = res.body.data.permissions.map((p: any) => p.permission);
            expect(perms).toContain("core:product:read");
            expect(perms).not.toContain("core:product:create");
        })

        it("returns an empty list (not an error) for an unknown role", async () => {
            const res = await request(app).get("/api/roles/nonexistent_role_xyz/permissions");

            expect(res.status).toBe(200);
            expect(res.body.data.permissions).toEqual([]);
        })
    })

    describe("GET /api/internal/rbac/permissions", () => {
        it("rejects a missing api-key with 401", async () => {
            const res = await request(app).get("/api/internal/rbac/permissions?role=owner");

            expect(res.status).toBe(401);
        })

        it("requires a role query with 400", async () => {
            const res = await request(app).get("/api/internal/rbac/permissions").set("api-key", INTERNAL_API_KEY);

            expect(res.status).toBe(400);
        })

        it("caches the response (MISS then HIT)", async () => {
            const first = await request(app).get("/api/internal/rbac/permissions?role=staff").set("api-key", INTERNAL_API_KEY);
            expect(first.headers["x-cache"]).toBe("MISS");

            const second = await request(app).get("/api/internal/rbac/permissions?role=staff").set("api-key", INTERNAL_API_KEY);
            expect(second.headers["x-cache"]).toBe("HIT");
        })
    })

    describe("POST /api/restaurants/:restaurantId/members (invite)", () => {
        it("invites a staff member and emails an OTP", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);
            const email = uniqueEmail("staff");

            const res = await ownerAgent.post(`/api/restaurants/${restaurant.id}/members`).send({
                email, name: "Staff One", phoneNumber: uniquePhone(), role: "staff", branchIds: [branch.id],
            });

            expect(res.status).toBe(201);
            expect(emailstub.sent.some((m) => m.to === email)).toBe(true);
            const member = await db("restaurant_members").where("id", res.body.data.member.id).first();
            expect(member.status).toBe("inactive");
        })

        it("rejects inviting with role=owner with 400", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerAgent.post(`/api/restaurants/${restaurant.id}/members`).send({
                email: uniqueEmail(), name: "X", phoneNumber: uniquePhone(), role: "owner",
            });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/owner/i);
        })

        it("rejects an unknown role with 404", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerAgent.post(`/api/restaurants/${restaurant.id}/members`).send({
                email: uniqueEmail(), name: "X", phoneNumber: uniquePhone(), role: "not_a_real_role",
            });

            expect(res.status).toBe(404);
        })

        it("rejects a branchId that does not belong to the restaurant with 400", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerAgent.post(`/api/restaurants/${restaurant.id}/members`).send({
                email: uniqueEmail(), name: "X", phoneNumber: uniquePhone(), role: "staff", branchIds: [999999999],
            });

            expect(res.status).toBe(400);
        })

        it("rejects staff inviting members (no core:member:create) with 403", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {agent: staffAgent} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "staff"});

            const res = await staffAgent.post(`/api/restaurants/${restaurant.id}/members`).send({
                email: uniqueEmail(), name: "X", phoneNumber: uniquePhone(), role: "staff",
            });

            expect(res.status).toBe(403);
        })
    })

    describe("accept-invite + permission enforcement end-to-end", () => {
        it("activates the member on accept-invite and enforces their role's permissions on login", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {agent: staffAgent} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "staff"});

            const read = await staffAgent.get(`/api/restaurants/${restaurant.id}/products`);
            expect(read.status).toBe(200);

            const create = await staffAgent.post(`/api/restaurants/${restaurant.id}/products`).send({name: "Staff Cannot Create"});
            expect(create.status).toBe(403);
        })
    })

    describe("GET /api/restaurants/:restaurantId/members", () => {
        it("lists members including the invited (inactive) staff", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const email = uniqueEmail("staff");
            await ownerAgent.post(`/api/restaurants/${restaurant.id}/members`).send({
                email, name: "Staff One", phoneNumber: uniquePhone(), role: "staff",
            });

            const res = await ownerAgent.get(`/api/restaurants/${restaurant.id}/members`);

            expect(res.status).toBe(200);
            expect(res.body.data.data.some((m: any) => m.email === email)).toBe(true);
        })
    })

    describe("PATCH /api/restaurants/:restaurantId/members/:memberId (update)", () => {
        it("updates a member's role", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {memberId} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "staff"});

            const res = await ownerAgent.patch(`/api/restaurants/${restaurant.id}/members/${memberId}`).send({role: "branch_manager"});

            expect(res.status).toBe(200);
            const member = await db("restaurant_members").where("id", memberId).first();
            const role = await db("roles").where("id", member.role_id).first();
            expect(role.name).toBe("branch_manager");
        })

        it("returns 404 for a nonexistent member", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerAgent.patch(`/api/restaurants/${restaurant.id}/members/999999999`).send({role: "staff"});

            expect(res.status).toBe(404);
        })

        it("updates a member's status without touching their role", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {memberId} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "staff"});

            const res = await ownerAgent.patch(`/api/restaurants/${restaurant.id}/members/${memberId}`).send({status: "suspended"});

            expect(res.status).toBe(200);
            const member = await db("restaurant_members").where("id", memberId).first();
            expect(member.status).toBe("suspended");
        })
    })

    describe("PUT /api/restaurants/:restaurantId/members/:memberId/branches", () => {
        it("rejects a branchId outside the restaurant with 400", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {memberId} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "staff"});

            const res = await ownerAgent.put(`/api/restaurants/${restaurant.id}/members/${memberId}/branches`).send({branchIds: [999999999]});

            expect(res.status).toBe(400);
        })

        it("assigns valid branchIds", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);
            const {memberId} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "staff"});

            const res = await ownerAgent.put(`/api/restaurants/${restaurant.id}/members/${memberId}/branches`).send({branchIds: [branch.id]});

            expect(res.status).toBe(200);
            const rows = await db("member_branches").where("member_id", memberId);
            expect(rows.map((r: any) => Number(r.branch_id))).toEqual([Number(branch.id)]);
        })

        it("returns 404 for a nonexistent member", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);

            const res = await ownerAgent.put(`/api/restaurants/${restaurant.id}/members/999999999/branches`).send({branchIds: [branch.id]});

            expect(res.status).toBe(404);
        })

        it("rejects assigning branches to the owner's own member (owners already have access to all branches)", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerEmail, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);
            const ownerUser = await db("users").where("email", ownerEmail).first();
            const ownerMember = await db("restaurant_members").where("restaurant_id", restaurant.id).where("user_id", ownerUser.id).first();

            const res = await ownerAgent.put(`/api/restaurants/${restaurant.id}/members/${ownerMember.id}/branches`).send({branchIds: [branch.id]});

            expect(res.status).toBe(400);
        })
    })

    describe("DELETE /api/restaurants/:restaurantId/members/:memberId", () => {
        it("rejects deleting the owner member with 400", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerEmail, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const ownerUser = await db("users").where("email", ownerEmail).first();
            const ownerMember = await db("restaurant_members").where("restaurant_id", restaurant.id).where("user_id", ownerUser.id).first();

            const res = await ownerAgent.delete(`/api/restaurants/${restaurant.id}/members/${ownerMember.id}`);

            expect(res.status).toBe(400);
        })

        it("deletes a staff member, and a later update on them 404s", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {memberId} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "staff"});

            const del = await ownerAgent.delete(`/api/restaurants/${restaurant.id}/members/${memberId}`);
            expect(del.status).toBe(200);

            const update = await ownerAgent.patch(`/api/restaurants/${restaurant.id}/members/${memberId}`).send({role: "staff"});
            expect(update.status).toBe(404);
        })

        it("returns 404 for a nonexistent member", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerAgent.delete(`/api/restaurants/${restaurant.id}/members/999999999`);

            expect(res.status).toBe(404);
        })
    })

    describe("member invite email failure (best-effort, non-blocking)", () => {
        it("still creates the member and returns 201 when the invitation email fails to send", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            emailstub.failNextSendWith = new Error("mailjet down");
            const email = uniqueEmail("staff");

            const res = await ownerAgent.post(`/api/restaurants/${restaurant.id}/members`).send({
                email, name: "Staff One", phoneNumber: uniquePhone(), role: "staff",
            });

            expect(res.status).toBe(201);
            const member = await db("restaurant_members").where("id", res.body.data.member.id).first();
            expect(member).toBeTruthy();
            expect(emailstub.sent.some((m) => m.to === email)).toBe(false);
        })
    })
})
