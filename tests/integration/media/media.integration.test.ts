import "reflect-metadata"
import request from "supertest"
import {emailstub} from "../../helpers/email-stub";
import {storagestub, STUB_PUBLIC_BASE_URL} from "../../helpers/storage-stub";
import {truncateAll} from "../../helpers/db";
import {flushTestCache} from "../../helpers/redis";
import {
    adminSession, createActiveRestaurantWithOwner, inviteAndActivateMember,
    insertUser, loginAgent, uniqueEmail, STRONG_PASSWORD,
} from "../../helpers/fixtures";

jest.mock("../../../src/lib/email/init", () => ({
    emailProvider: emailstub
}))

// S3 is a true external with no safe local equivalent, so it is stubbed the
// same way Mailjet is — everything under it (service, repository, Postgres) is real.
jest.mock("../../../src/lib/storage/init", () => ({
    storageProvider: storagestub
}))

import {createApp} from "../../../src/app";
import {db} from "../../../src/lib/knex/knex";

const app = createApp();

/** .env.test's MEDIA_MAX_UPLOAD_BYTES */
const MAX_UPLOAD_BYTES = 5_242_880;

const admin = () => adminSession(app);

/** Requests an upload ticket as `agent` and returns the response payload. */
async function requestUpload(agent: ReturnType<typeof request.agent>, body: Record<string, unknown> = {}) {
    const res = await agent.post("/api/media/uploads").send({contentType: "image/png", ...body});
    if (res.status !== 201) {
        throw new Error(`requestUpload failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.data;
}

/** Full happy path: ticket + the client-side PUT (simulated on the stub) + finalize. */
async function uploadAndComplete(agent: ReturnType<typeof request.agent>, body: Record<string, unknown> = {}) {
    const ticket = await requestUpload(agent, body);
    storagestub.putObject(ticket.media.storageKey, 2048, ticket.media.contentType);
    const res = await agent.post(`/api/media/${ticket.media.id}/complete`).send();
    if (res.status !== 200) {
        throw new Error(`uploadAndComplete failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.data.media;
}

describe("media", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushTestCache();
        emailstub.reset();
        storagestub.reset();
    })

    describe("POST /api/media/uploads", () => {
        it("gives an owner a presigned URL and a pending row scoped to their restaurant", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerAgent.post("/api/media/uploads").send({contentType: "image/png", fileName: "Burger Deluxe.PNG"});

            expect(res.status).toBe(201);
            const {media, uploadUrl, expiresIn} = res.body.data;
            expect(media).toMatchObject({
                restaurantId: restaurant.id,
                contentType: "image/png",
                status: "pending",
                sizeBytes: null,
            });
            expect(media.storageKey).toMatch(new RegExp(`^restaurants/${restaurant.id}/\\d{4}/\\d{2}/[0-9a-f-]{36}-burger-deluxe\\.png$`));
            expect(media.url).toBe(`${STUB_PUBLIC_BASE_URL}/${media.storageKey}`);
            expect(uploadUrl).toContain(media.storageKey);
            expect(expiresIn).toBe(900);
            // The URL must be signed for exactly the type recorded on the row.
            expect(storagestub.signed).toEqual([{key: media.storageKey, contentType: "image/png", expiresInSeconds: 900}]);

            const row = await db("media").where("id", media.id).first();
            expect(row).toMatchObject({status: "pending", content_type: "image/png", size_bytes: null});
            expect(row.restaurant_id).toBe(restaurant.id);
        })

        it("lets a system admin upload with no restaurant, for a logo created before the restaurant exists", async () => {
            const {agent: adminAgent, user} = await admin();

            const res = await adminAgent.post("/api/media/uploads").send({contentType: "image/webp"});

            expect(res.status).toBe(201);
            expect(res.body.data.media).toMatchObject({restaurantId: null, status: "pending"});
            expect(res.body.data.media.storageKey).toMatch(/^restaurants\/shared\/\d{4}\/\d{2}\//);

            const row = await db("media").where("id", res.body.data.media.id).first();
            expect(row.restaurant_id).toBeNull();
            expect(Number(row.uploaded_by)).toBe(Number(user.id));
        })

        it("owns the media by the target restaurant, not by the admin performing the upload", async () => {
            const {agent: adminAgent, user: adminUser} = await admin();
            const {restaurant} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await adminAgent.post("/api/media/uploads").send({contentType: "image/png", restaurantId: restaurant.id});

            expect(res.status).toBe(201);
            // restaurant_id is the resource owner; uploaded_by is the actor.
            expect(res.body.data.media.restaurantId).toBe(restaurant.id);
            expect(res.body.data.media.storageKey).toMatch(new RegExp(`^restaurants/${restaurant.id}/`));
            const row = await db("media").where("id", res.body.data.media.id).first();
            expect(row.restaurant_id).toBe(restaurant.id);
            expect(Number(row.uploaded_by)).toBe(Number(adminUser.id));
        })

        it("keeps the same file uploaded twice as two independent objects", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const body = {contentType: "image/png", fileName: "burger.png"};

            const first = await ownerAgent.post("/api/media/uploads").send(body);
            const second = await ownerAgent.post("/api/media/uploads").send(body);

            expect([first.status, second.status]).toEqual([201, 201]);
            const a = first.body.data.media;
            const b = second.body.data.media;
            // A uuid per key means re-uploading the same photo can never collide
            // with or overwrite the earlier one.
            expect(a.storageKey).not.toBe(b.storageKey);
            expect(a.url).not.toBe(b.url);
            expect(a.id).not.toBe(b.id);
            const uuidKey = new RegExp(`^restaurants/${restaurant.id}/\\d{4}/\\d{2}/[0-9a-f-]{36}-burger\\.png$`);
            expect(a.storageKey).toMatch(uuidKey);
            expect(b.storageKey).toMatch(uuidKey);

            // Both finalize independently, and both rows survive.
            storagestub.putObject(a.storageKey, 1111);
            storagestub.putObject(b.storageKey, 2222);
            await expect(ownerAgent.post(`/api/media/${a.id}/complete`).send()).resolves.toMatchObject({status: 200});
            await expect(ownerAgent.post(`/api/media/${b.id}/complete`).send()).resolves.toMatchObject({status: 200});
            const rows = await db("media").whereIn("id", [a.id, b.id]).orderBy("id");
            expect(rows.map((r: any) => Number(r.size_bytes))).toEqual([1111, 2222]);
            expect(storagestub.objects.size).toBe(2);
        })

        it("deleting one copy leaves the other copy's object untouched", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const body = {contentType: "image/png", fileName: "burger.png"};
            const kept = await uploadAndComplete(ownerAgent, body);
            const removed = await uploadAndComplete(ownerAgent, body);

            const res = await ownerAgent.delete(`/api/media/${removed.id}`);

            expect(res.status).toBe(200);
            expect(storagestub.deleted).toEqual([removed.storageKey]);
            expect(storagestub.objects.has(kept.storageKey)).toBe(true);
            expect(await db("media").where("id", kept.id).first()).toMatchObject({status: "ready"});
        })

        it("rejects an admin upload for a restaurant that does not exist with 404", async () => {
            const {agent: adminAgent} = await admin();

            const res = await adminAgent.post("/api/media/uploads").send({contentType: "image/png", restaurantId: 999999});

            expect(res.status).toBe(404);
            expect(await db("media").count("* as c").first()).toMatchObject({c: "0"});
        })

        it("rejects an owner uploading for another restaurant with 403", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {restaurant: other} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerAgent.post("/api/media/uploads").send({contentType: "image/png", restaurantId: other.id});

            expect(res.status).toBe(403);
            expect(await db("media").count("* as c").first()).toMatchObject({c: "0"});
        })

        it("rejects a non-image content type with 415 and stores nothing", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerAgent.post("/api/media/uploads").send({contentType: "application/pdf"});

            expect(res.status).toBe(415);
            expect(res.body.error).toContain("application/pdf");
            expect(storagestub.signed).toHaveLength(0);
            expect(await db("media").count("* as c").first()).toMatchObject({c: "0"});
        })

        it("rejects a missing contentType with 400", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerAgent.post("/api/media/uploads").send({fileName: "x.png"});

            expect(res.status).toBe(400);
        })

        it("rejects an unauthenticated request with 401", async () => {
            const res = await request(app).post("/api/media/uploads").send({contentType: "image/png"});

            expect(res.status).toBe(401);
        })

        it("rejects a customer with 403 — media is admin/restaurant only", async () => {
            const user = await insertUser({password: STRONG_PASSWORD});
            const customerAgent = await loginAgent(app, user.email);

            const res = await customerAgent.post("/api/media/uploads").send({contentType: "image/png"});

            expect(res.status).toBe(403);
        })

        it("allows a branch_manager (holds core:media:create)", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {agent: bmAgent} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "branch_manager"});

            const res = await bmAgent.post("/api/media/uploads").send({contentType: "image/png"});

            expect(res.status).toBe(201);
            expect(res.body.data.media.restaurantId).toBe(restaurant.id);
        })

        it("rejects staff with 403 (no core:media:create)", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {agent: staffAgent} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "staff"});

            const res = await staffAgent.post("/api/media/uploads").send({contentType: "image/png"});

            expect(res.status).toBe(403);
        })
    })

    describe("POST /api/media/:id/complete", () => {
        it("marks the media ready and records the uploaded size", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {media} = await requestUpload(ownerAgent);
            storagestub.putObject(media.storageKey, 4096);

            const res = await ownerAgent.post(`/api/media/${media.id}/complete`).send();

            expect(res.status).toBe(200);
            expect(res.body.data.media).toMatchObject({id: media.id, status: "ready", sizeBytes: 4096});

            const row = await db("media").where("id", media.id).first();
            expect(row).toMatchObject({status: "ready"});
            expect(Number(row.size_bytes)).toBe(4096);
        })

        it("rejects finalizing before the file was uploaded with 409, leaving the row pending", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {media} = await requestUpload(ownerAgent);

            const res = await ownerAgent.post(`/api/media/${media.id}/complete`).send();

            expect(res.status).toBe(409);
            expect(await db("media").where("id", media.id).first()).toMatchObject({status: "pending"});
        })

        it("rejects an oversized upload with 413, marks it failed and removes the object", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {media} = await requestUpload(ownerAgent);
            storagestub.putObject(media.storageKey, MAX_UPLOAD_BYTES + 1);

            const res = await ownerAgent.post(`/api/media/${media.id}/complete`).send();

            expect(res.status).toBe(413);
            expect(storagestub.deleted).toEqual([media.storageKey]);
            expect(storagestub.objects.has(media.storageKey)).toBe(false);
            const row = await db("media").where("id", media.id).first();
            expect(row).toMatchObject({status: "failed"});
            expect(Number(row.size_bytes)).toBe(MAX_UPLOAD_BYTES + 1);
        })

        it("accepts an upload exactly at the size limit", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {media} = await requestUpload(ownerAgent);
            storagestub.putObject(media.storageKey, MAX_UPLOAD_BYTES);

            const res = await ownerAgent.post(`/api/media/${media.id}/complete`).send();

            expect(res.status).toBe(200);
            expect(res.body.data.media).toMatchObject({status: "ready", sizeBytes: MAX_UPLOAD_BYTES});
        })

        it("is idempotent — completing an already-ready media returns it unchanged", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const media = await uploadAndComplete(ownerAgent);
            storagestub.objects.delete(media.storageKey); // a second call must not re-check storage

            const res = await ownerAgent.post(`/api/media/${media.id}/complete`).send();

            expect(res.status).toBe(200);
            expect(res.body.data.media).toMatchObject({id: media.id, status: "ready", sizeBytes: 2048});
        })

        it("rejects another restaurant's owner with 403", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {ownerAgent: otherOwner} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {media} = await requestUpload(ownerAgent);
            storagestub.putObject(media.storageKey, 1024);

            const res = await otherOwner.post(`/api/media/${media.id}/complete`).send();

            expect(res.status).toBe(403);
            expect(await db("media").where("id", media.id).first()).toMatchObject({status: "pending"});
        })

        it("returns 404 for an unknown media id", async () => {
            const {agent: adminAgent} = await admin();

            const res = await adminAgent.post("/api/media/999999/complete").send();

            expect(res.status).toBe(404);
        })
    })

    describe("GET /api/media/:id", () => {
        it("returns the caller's own restaurant media", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const media = await uploadAndComplete(ownerAgent);

            const res = await ownerAgent.get(`/api/media/${media.id}`);

            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({id: media.id, restaurantId: restaurant.id, status: "ready", url: media.url});
        })

        it("lets a system admin read any restaurant's media", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const media = await uploadAndComplete(ownerAgent);

            const res = await adminAgent.get(`/api/media/${media.id}`);

            expect(res.status).toBe(200);
            expect(res.body.data.id).toBe(media.id);
        })

        it("hides another restaurant's media behind 403", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {ownerAgent: otherOwner} = await createActiveRestaurantWithOwner(app, adminAgent);
            const media = await uploadAndComplete(ownerAgent);

            const res = await otherOwner.get(`/api/media/${media.id}`);

            expect(res.status).toBe(403);
        })

        it("hides admin-owned media with no restaurant from a restaurant user", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const media = await uploadAndComplete(adminAgent);

            const res = await ownerAgent.get(`/api/media/${media.id}`);

            expect(res.status).toBe(403);
        })

        it("rejects staff with 403 (no core:media:read)", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {agent: staffAgent} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "staff"});
            const media = await uploadAndComplete(ownerAgent);

            const res = await staffAgent.get(`/api/media/${media.id}`);

            expect(res.status).toBe(403);
        })

        it("returns 404 for an unknown id", async () => {
            const {agent: adminAgent} = await admin();

            const res = await adminAgent.get("/api/media/999999");

            expect(res.status).toBe(404);
        })

        it("returns 400 for a non-numeric id", async () => {
            const {agent: adminAgent} = await admin();

            const res = await adminAgent.get("/api/media/abc");

            expect(res.status).toBe(400);
        })

        it("rejects an unauthenticated request with 401", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const media = await uploadAndComplete(ownerAgent);

            const res = await request(app).get(`/api/media/${media.id}`);

            expect(res.status).toBe(401);
        })
    })

    describe("DELETE /api/media/:id", () => {
        it("removes the object from storage and marks the row deleted", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const media = await uploadAndComplete(ownerAgent);

            const res = await ownerAgent.delete(`/api/media/${media.id}`);

            expect(res.status).toBe(200);
            expect(res.body.data.media).toMatchObject({id: media.id, status: "deleted"});
            expect(storagestub.deleted).toEqual([media.storageKey]);
            // The row survives so anything still pointing at the URL stays traceable.
            expect(await db("media").where("id", media.id).first()).toMatchObject({status: "deleted"});
        })

        it("makes the media unreadable afterwards", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const media = await uploadAndComplete(ownerAgent);
            await ownerAgent.delete(`/api/media/${media.id}`);

            const res = await ownerAgent.get(`/api/media/${media.id}`);

            expect(res.status).toBe(404);
        })

        it("rejects a branch_manager with 403 (no core:media:delete)", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {agent: bmAgent} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "branch_manager"});
            const media = await uploadAndComplete(ownerAgent);

            const res = await bmAgent.delete(`/api/media/${media.id}`);

            expect(res.status).toBe(403);
            expect(storagestub.deleted).toHaveLength(0);
            expect(await db("media").where("id", media.id).first()).toMatchObject({status: "ready"});
        })

        it("rejects another restaurant's owner with 403", async () => {
            const {agent: adminAgent} = await admin();
            const {ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {ownerAgent: otherOwner} = await createActiveRestaurantWithOwner(app, adminAgent);
            const media = await uploadAndComplete(ownerAgent);

            const res = await otherOwner.delete(`/api/media/${media.id}`);

            expect(res.status).toBe(403);
            expect(storagestub.deleted).toHaveLength(0);
        })
    })

    describe("upload -> product/logo flow", () => {
        it("lets an owner attach an uploaded media URL to a product", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const media = await uploadAndComplete(ownerAgent);

            const res = await ownerAgent.post(`/api/restaurants/${restaurant.id}/products`)
                .send({name: "Pizza", imageUrl: media.url});

            expect(res.status).toBe(201);
            expect(res.body.data.product.imageUrl).toBe(media.url);
            expect(await db("products").where("id", res.body.data.product.id).first()).toMatchObject({image_url: media.url});
        })

        it("lets an admin upload a logo before the restaurant exists and use it at creation", async () => {
            const {agent: adminAgent} = await admin();
            const media = await uploadAndComplete(adminAgent);

            const res = await adminAgent.post("/api/restaurants").send({
                owner: {email: uniqueEmail("logo_owner"), phone: "01099887766", name: "Owner", password: STRONG_PASSWORD},
                name: "Logo Restaurant",
                primaryCountry: "eg",
                logoUrl: media.url,
            });

            expect(res.status).toBe(201);
            expect(res.body.data.restaurant.logoURL).toBe(media.url);
        })
    })
})
