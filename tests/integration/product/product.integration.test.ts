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

async function setupProduct() {
    const {agent: adminAgent} = await admin();
    const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
    const branch = await createBranch(ownerAgent, restaurant.id);
    const productRes = await ownerAgent.post(`/api/restaurants/${restaurant.id}/products`).send({name: "Pizza", categoryName: "Mains"});
    const product = productRes.body.data.product;
    return {adminAgent, restaurant, ownerAgent, branch, product};
}

describe("product", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushTestCache();
        emailstub.reset();
    })

    describe("POST /api/restaurants/:restaurantId/products", () => {
        it("allows the owner to create a product, auto-creating category and branch details", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const branch = await createBranch(ownerAgent, restaurant.id);

            const res = await ownerAgent.post(`/api/restaurants/${restaurant.id}/products`).send({name: "Pizza", description: "cheesy", categoryName: "Mains"});

            expect(res.status).toBe(201);
            const product = res.body.data.product;

            const category = await db("product_categories").where("restaurant_id", restaurant.id).where("name", "Mains").first();
            expect(category).toBeTruthy();

            // trigger auto-creates a zero-stock, unavailable row per branch
            const pbd = await db("product_branch_details").where("product_id", product.id).where("branch_id", branch.id).first();
            expect(pbd).toMatchObject({price: 0, stock: 0, is_available: false});
        })

        it("rejects a missing required name with 400", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await ownerAgent.post(`/api/restaurants/${restaurant.id}/products`).send({description: "no name"});

            expect(res.status).toBe(400);
        })

        it("allows a branch_manager to create a product (has core:product:create)", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {agent: bmAgent} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "branch_manager"});

            const res = await bmAgent.post(`/api/restaurants/${restaurant.id}/products`).send({name: "BM Product"});

            expect(res.status).toBe(201);
        })

        it("rejects staff (no core:product:create) with 403", async () => {
            const {agent: adminAgent} = await admin();
            const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);
            const {agent: staffAgent} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "staff"});

            const res = await staffAgent.post(`/api/restaurants/${restaurant.id}/products`).send({name: "Staff Cannot Create"});

            expect(res.status).toBe(403);
        })
    })

    describe("GET /api/restaurants/:restaurantId/products", () => {
        it("allows staff to read products (core:product:read)", async () => {
            const {restaurant, ownerAgent} = await setupProduct();
            const {agent: staffAgent} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "staff"});

            const res = await staffAgent.get(`/api/restaurants/${restaurant.id}/products`);

            expect(res.status).toBe(200);
        })

        it("rejects a different restaurant's owner with 403", async () => {
            const {restaurant, adminAgent} = await setupProduct();
            const {ownerAgent: otherOwnerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await otherOwnerAgent.get(`/api/restaurants/${restaurant.id}/products`);

            expect(res.status).toBe(403);
        })
    })

    describe("GET /api/restaurants/:restaurantId/categories", () => {
        it("lists categories publicly", async () => {
            const {restaurant} = await setupProduct();

            const res = await request(app).get(`/api/restaurants/${restaurant.id}/categories`);

            expect(res.status).toBe(200);
            expect(res.body.data.some((c: any) => c.name === "Mains")).toBe(true);
        })
    })

    describe("GET /api/branches/:branchId/products", () => {
        it("lists products for a branch publicly", async () => {
            const {branch, product} = await setupProduct();

            const res = await request(app).get(`/api/branches/${branch.id}/products`);

            expect(res.status).toBe(200);
            expect(res.body.data.some((p: any) => Number(p.id) === Number(product.id))).toBe(true);
        })
    })

    describe("GET /api/products/:id", () => {
        it("returns the product by id", async () => {
            const {product} = await setupProduct();

            const res = await request(app).get(`/api/products/${product.id}`);

            expect(res.status).toBe(200);
            expect(res.body.data.id).toBe(product.id);
        })

        it("returns 404 for a nonexistent product", async () => {
            const res = await request(app).get("/api/products/999999999");

            expect(res.status).toBe(404);
        })
    })

    describe("PATCH /api/products/:id", () => {
        it("updates name/description without a branchId", async () => {
            const {product, ownerAgent} = await setupProduct();

            const res = await ownerAgent.patch(`/api/products/${product.id}`).send({description: "updated"});

            expect(res.status).toBe(200);
            expect(res.body.data.product.description).toBe("updated");
            expect(res.body.data.branchDetails).toBeUndefined();
        })

        it("updates branch-level price/stock when branchId is given", async () => {
            const {product, branch, ownerAgent} = await setupProduct();

            const res = await ownerAgent.patch(`/api/products/${product.id}?branchId=${branch.id}`).send({price: 1500, stock: 50, isAvailable: true});

            expect(res.status).toBe(200);
            expect(res.body.data.branchDetails).toMatchObject({price: 1500, stock: 50, isAvailable: true});
        })

        it("writes price-changed and stock-changed outbox events", async () => {
            const {product, branch, ownerAgent} = await setupProduct();

            await ownerAgent.patch(`/api/products/${product.id}?branchId=${branch.id}`).send({price: 1500, stock: 50, isAvailable: true});

            const priceEvent = await db("events_outbox").where("event_type", "product.price.changed").first();
            const stockEvent = await db("events_outbox").where("event_type", "product.stock.changed").first();
            expect(priceEvent).toBeTruthy();
            expect(stockEvent).toBeTruthy();
        })

        it("returns 404 for a nonexistent product", async () => {
            const {ownerAgent} = await setupProduct();

            const res = await ownerAgent.patch("/api/products/999999999").send({description: "ghost"});

            expect(res.status).toBe(404);
        })

        it("auto-creates a new category when updating with a categoryName that doesn't exist yet", async () => {
            const {product, ownerAgent, restaurant} = await setupProduct();

            const res = await ownerAgent.patch(`/api/products/${product.id}`).send({categoryName: "Desserts"});

            expect(res.status).toBe(200);
            const category = await db("product_categories").where("restaurant_id", restaurant.id).where("name", "Desserts").first();
            expect(category).toBeTruthy();
            expect(res.body.data.product.categoryId).toBe(category.id);
        })

        it("[CRITICAL] rejects a different restaurant's owner updating name/description with no branchId scoping", async () => {
            const {product, adminAgent} = await setupProduct();
            const {ownerAgent: otherOwnerAgent} = await createActiveRestaurantWithOwner(app, adminAgent);

            const res = await otherOwnerAgent.patch(`/api/products/${product.id}`).send({description: "hijacked"});

            expect(res.status).toBe(403);
        })

        it("allows a branch_manager to set price/stock on an assigned branch", async () => {
            const {product, branch, restaurant, ownerAgent} = await setupProduct();
            const {agent: bmAgent} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "branch_manager", branchIds: [branch.id]});

            const res = await bmAgent.patch(`/api/products/${product.id}?branchId=${branch.id}`).send({price: 999, stock: 10, isAvailable: true});

            expect(res.status).toBe(200);
        })

        it("rejects a branch_manager setting price/stock on an unassigned branch", async () => {
            const {product, restaurant, ownerAgent} = await setupProduct();
            const otherBranch = await createBranch(ownerAgent, restaurant.id, {label: "Other Branch"});
            const {agent: bmAgent} = await inviteAndActivateMember(app, ownerAgent, restaurant.id, {role: "branch_manager", branchIds: []});

            const res = await bmAgent.patch(`/api/products/${product.id}?branchId=${otherBranch.id}`).send({price: 111, stock: 5, isAvailable: true});

            expect(res.status).toBe(403);
        })
    })

    describe("internal: reserve-stock / release-stock", () => {
        it("rejects a missing api-key with 401", async () => {
            const res = await request(app).post("/api/internal/branches/1/reserve-stock").send({items: []});

            expect(res.status).toBe(401);
        })

        it("returns 409 and does not mutate stock when reserving more than available", async () => {
            const {product, branch, ownerAgent} = await setupProduct();
            await ownerAgent.patch(`/api/products/${product.id}?branchId=${branch.id}`).send({price: 1000, stock: 50, isAvailable: true});

            const res = await request(app).post(`/api/internal/branches/${branch.id}/reserve-stock`)
                .set("api-key", INTERNAL_API_KEY)
                .set("Idempotency-Key", "test-reserve-overflow-1")
                .send({items: [{productId: product.id, quantity: 10000}]});

            expect(res.status).toBe(409);

            const pbd = await db("product_branch_details").where("branch_id", branch.id).where("product_id", product.id).first();
            expect(pbd.stock).toBe(50);
        })

        it("reserves valid stock and releases it back", async () => {
            const {product, branch, ownerAgent} = await setupProduct();
            await ownerAgent.patch(`/api/products/${product.id}?branchId=${branch.id}`).send({price: 1000, stock: 50, isAvailable: true});

            const reserve = await request(app).post(`/api/internal/branches/${branch.id}/reserve-stock`)
                .set("api-key", INTERNAL_API_KEY)
                .set("Idempotency-Key", "test-reserve-then-release-1")
                .send({items: [{productId: product.id, quantity: 5}]});
            expect(reserve.status).toBe(200);
            expect(reserve.body.data.applied[0].newStock).toBe(45);

            const release = await request(app).post(`/api/internal/branches/${branch.id}/release-stock`)
                .set("api-key", INTERNAL_API_KEY)
                .set("Idempotency-Key", "test-reserve-then-release-1")
                .send({items: [{productId: product.id, quantity: 5}]});
            expect(release.status).toBe(200);
            expect(release.body.data.applied[0].newStock).toBe(50);
        })

        it("rejects empty items with 400", async () => {
            const res = await request(app).post("/api/internal/branches/1/reserve-stock")
                .set("api-key", INTERNAL_API_KEY)
                .set("Idempotency-Key", "test-empty-items-1")
                .send({items: []});

            expect(res.status).toBe(400);
        })

        it("returns 409 for a product that is priced/stocked but marked unavailable", async () => {
            const {product, branch, ownerAgent} = await setupProduct();
            await ownerAgent.patch(`/api/products/${product.id}?branchId=${branch.id}`).send({price: 1000, stock: 50, isAvailable: false});

            const res = await request(app).post(`/api/internal/branches/${branch.id}/reserve-stock`)
                .set("api-key", INTERNAL_API_KEY)
                .set("Idempotency-Key", "test-unavailable-product-1")
                .send({items: [{productId: product.id, quantity: 1}]});

            expect(res.status).toBe(409);
        })

        it("rejects malformed item shapes (non-integer productId/quantity) with 400 at the service level", async () => {
            const {branch} = await setupProduct();

            const res = await request(app).post(`/api/internal/branches/${branch.id}/reserve-stock`)
                .set("api-key", INTERNAL_API_KEY)
                .set("Idempotency-Key", "test-malformed-items-1")
                .send({items: [{productId: "not-a-number", quantity: 1}]});

            expect(res.status).toBe(400);
        })

        it("rejects a reserve-stock/release-stock call with no Idempotency-Key header (strict mode)", async () => {
            const {product, branch} = await setupProduct();

            const reserveRes = await request(app).post(`/api/internal/branches/${branch.id}/reserve-stock`)
                .set("api-key", INTERNAL_API_KEY)
                .send({items: [{productId: product.id, quantity: 1}]});
            expect(reserveRes.status).toBe(400);
            expect(reserveRes.body.error).toMatch(/Idempotency-Key/);

            const releaseRes = await request(app).post(`/api/internal/branches/${branch.id}/release-stock`)
                .set("api-key", INTERNAL_API_KEY)
                .send({items: [{productId: product.id, quantity: 1}]});
            expect(releaseRes.status).toBe(400);
            expect(releaseRes.body.error).toMatch(/Idempotency-Key/);
        })

        it("replays the cached response for a repeated Idempotency-Key instead of mutating stock twice", async () => {
            const {product, branch, ownerAgent} = await setupProduct();
            await ownerAgent.patch(`/api/products/${product.id}?branchId=${branch.id}`).send({price: 1000, stock: 50, isAvailable: true});
            const key = "test-idempotent-reserve-replay-1";
            const body = {items: [{productId: product.id, quantity: 5}]};

            const first = await request(app).post(`/api/internal/branches/${branch.id}/reserve-stock`)
                .set("api-key", INTERNAL_API_KEY)
                .set("Idempotency-Key", key)
                .send(body);
            expect(first.status).toBe(200);
            expect(first.body.data.applied[0].newStock).toBe(45);

            const second = await request(app).post(`/api/internal/branches/${branch.id}/reserve-stock`)
                .set("api-key", INTERNAL_API_KEY)
                .set("Idempotency-Key", key)
                .send(body);
            expect(second.status).toBe(200);
            expect(second.body).toEqual(first.body); // replayed from cache, not re-executed

            // Stock decremented exactly once, not twice.
            const pbd = await db("product_branch_details").where("branch_id", branch.id).where("product_id", product.id).first();
            expect(pbd.stock).toBe(45);
        })
    })

    describe("internal: findByBranchAndIds", () => {
        it("returns 400 when ids query is missing", async () => {
            const {branch} = await setupProduct();

            const res = await request(app).get(`/api/internal/branches/${branch.id}/products`).set("api-key", INTERNAL_API_KEY);

            expect(res.status).toBe(400);
        })

        it("returns product rows for the given ids", async () => {
            const {branch, product} = await setupProduct();

            const res = await request(app).get(`/api/internal/branches/${branch.id}/products?ids=${product.id}`).set("api-key", INTERNAL_API_KEY);

            expect(res.status).toBe(200);
            expect(res.body.data[0].productId).toBe(product.id);
        })
    })
})
