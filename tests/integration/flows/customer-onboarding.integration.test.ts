import "reflect-metadata"
import request from "supertest"
import {emailstub} from "../../helpers/email-stub";
import {truncateAll} from "../../helpers/db";
import {flushTestCache} from "../../helpers/redis";
import {insertAdmin, loginAgent, createActiveRestaurantWithOwner, createBranch, uniqueEmail, uniquePhone, STRONG_PASSWORD} from "../../helpers/fixtures";

jest.mock("../../../src/lib/email/init", () => ({
    emailProvider: emailstub
}))

import {createApp} from "../../../src/app";

const app = createApp();

/**
 * End-to-end customer onboarding flow: register -> add a delivery address ->
 * browse restaurants/branches/products (all read-only, no restaurant
 * membership) -> confirm the read-only RBAC boundary (a plain customer
 * cannot perform restaurant-owner actions).
 */
describe("flow: customer onboarding", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushTestCache();
        emailstub.reset();
    })

    it("takes a new customer from registration through browsing a live restaurant's menu", async () => {
        // Seed a live restaurant/branch/product for the customer to discover.
        const admin = await insertAdmin();
        const adminAgent = await loginAgent(app, admin.email);
        const {restaurant, ownerAgent} = await createActiveRestaurantWithOwner(app, adminAgent, {name: "Corner Cafe"});
        const branch = await createBranch(ownerAgent, restaurant.id, {lat: 30.0444, lng: 31.2357, deliveryRadius: 10});
        await adminAgent.patch(`/api/branches/${branch.id}/status`).send({isActive: true});
        const productRes = await ownerAgent.post(`/api/restaurants/${restaurant.id}/products`).send({name: "Latte", categoryName: "Drinks"});
        const productId = productRes.body.data.product.id;
        await ownerAgent.patch(`/api/products/${productId}?branchId=${branch.id}`).send({price: 450, stock: 100, isAvailable: true});

        // 1. Register as a customer.
        const customerEmail = uniqueEmail("customer");
        const customerAgent = request.agent(app);
        const register = await customerAgent.post("/api/auth/register").send({
            email: customerEmail, phone: uniquePhone(), name: "New Customer",
            password: STRONG_PASSWORD, role: "customer",
        });
        expect(register.status).toBe(201);
        expect(register.body.data.user.systemRole).toBe("customer");

        // 2. Add a delivery address near the seeded branch.
        const addressRes = await customerAgent.post("/api/customer/addresses").send({
            label: "Home", country: "EG", city: "Cairo", street: "1 Home St",
            type: "home", lat: 30.0444, lng: 31.2357, isDefault: true,
        });
        expect(addressRes.status).toBe(201);

        const addresses = await customerAgent.get("/api/customer/addresses");
        expect(addresses.body.data).toHaveLength(1);
        expect(addresses.body.data[0].isDefault).toBe(true);

        // 3. Browse: nearby branches, that branch's products, and product detail --
        //    all public/read-only, no restaurant membership required.
        const nearby = await request(app).get("/api/branches/nearby?lat=30.0444&lng=31.2357");
        expect(nearby.status).toBe(200);
        expect(nearby.body.data.some((b: any) => Number(b.id) === Number(branch.id))).toBe(true);

        const products = await request(app).get(`/api/branches/${branch.id}/products`);
        expect(products.status).toBe(200);
        const latte = products.body.data.find((p: any) => p.name === "Latte");
        expect(latte).toMatchObject({price: 450, stock: 100, isAvailable: true});

        const productDetail = await customerAgent.get(`/api/products/${productId}`);
        expect(productDetail.status).toBe(200);
        expect(productDetail.body.data.name).toBe("Latte");

        // 4. Read-only RBAC boundary: a plain customer cannot act as a restaurant owner.
        const forbiddenCreate = await customerAgent.post(`/api/restaurants/${restaurant.id}/products`).send({name: "Should Not Be Allowed"});
        expect(forbiddenCreate.status).toBe(403);

        const forbiddenRestaurant = await customerAgent.post("/api/restaurants").send({
            owner: {email: uniqueEmail(), phone: uniquePhone(), name: "X", password: STRONG_PASSWORD},
            name: "Should Not Create", primaryCountry: "eg",
        });
        expect(forbiddenRestaurant.status).toBe(403);
    })
})
