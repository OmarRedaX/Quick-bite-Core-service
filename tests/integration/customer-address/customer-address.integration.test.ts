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

const app = createApp();

async function customer() {
    const user = await insertUser({systemRole: "customer"});
    const agent = await loginAgent(app, user.email);
    return {user, agent};
}

const validAddress = {
    label: "Home", country: "EG", city: "Cairo", street: "1 Test St",
    type: "home", lat: 30.05, lng: 31.23, isDefault: true,
};

describe("customer-address", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushTestCache();
        emailstub.reset();
    })

    describe("GET /api/customer/addresses", () => {
        it("rejects unauthenticated requests with 401", async () => {
            const res = await request(app).get("/api/customer/addresses");

            expect(res.status).toBe(401);
        })

        it("returns only the caller's own addresses", async () => {
            const {agent} = await customer();
            await agent.post("/api/customer/addresses").send(validAddress);

            const res = await agent.get("/api/customer/addresses");

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
        })
    })

    describe("POST /api/customer/addresses", () => {
        it("creates an address", async () => {
            const {agent} = await customer();

            const res = await agent.post("/api/customer/addresses").send(validAddress);

            expect(res.status).toBe(201);
            expect(res.body.data.address.isDefault).toBe(true);
        })

        it("rejects an invalid type enum with 400", async () => {
            const {agent} = await customer();

            const res = await agent.post("/api/customer/addresses").send({...validAddress, type: "invalid_type_xyz"});

            expect(res.status).toBe(400);
        })

        it("clears the previous default when a new address is marked default", async () => {
            const {agent} = await customer();
            const first = await agent.post("/api/customer/addresses").send(validAddress);
            const firstId = first.body.data.address.id;

            await agent.post("/api/customer/addresses").send({...validAddress, label: "Office", isDefault: true});

            const list = await agent.get("/api/customer/addresses");
            const firstAfter = list.body.data.find((a: any) => a.id === firstId);
            expect(firstAfter.isDefault).toBe(false);
            expect(list.body.data.filter((a: any) => a.isDefault).length).toBe(1);
        })
    })

    describe("ownership boundary", () => {
        it("returns 404 when patching another user's address", async () => {
            const {agent: ownerAgent} = await customer();
            const created = await ownerAgent.post("/api/customer/addresses").send(validAddress);
            const addressId = created.body.data.address.id;
            const {agent: otherAgent} = await customer();

            const res = await otherAgent.patch(`/api/customer/addresses/${addressId}`).send({label: "Hacked"});

            expect(res.status).toBe(404);
        })

        it("returns 404 when deleting another user's address", async () => {
            const {agent: ownerAgent} = await customer();
            const created = await ownerAgent.post("/api/customer/addresses").send(validAddress);
            const addressId = created.body.data.address.id;
            const {agent: otherAgent} = await customer();

            const res = await otherAgent.delete(`/api/customer/addresses/${addressId}`);

            expect(res.status).toBe(404);
        })

        it("allows the owner to update their own address", async () => {
            const {agent} = await customer();
            const created = await agent.post("/api/customer/addresses").send(validAddress);
            const addressId = created.body.data.address.id;

            const res = await agent.patch(`/api/customer/addresses/${addressId}`).send({label: "Updated Label"});

            expect(res.status).toBe(200);
            expect(res.body.data.address.label).toBe("Updated Label");
        })

        it("updates every optional field at once", async () => {
            const {agent} = await customer();
            const created = await agent.post("/api/customer/addresses").send(validAddress);
            const addressId = created.body.data.address.id;

            const res = await agent.patch(`/api/customer/addresses/${addressId}`).send({
                country: "SA", city: "Riyadh", street: "2 New St", building: "B2",
                apartmentNumber: "12", type: "office", lat: 24.7, lng: 46.6, isDefault: false,
            });

            expect(res.status).toBe(200);
            expect(res.body.data.address).toMatchObject({
                country: "SA", city: "Riyadh", street: "2 New St", building: "B2",
                apartmentNumber: "12", type: "office", isDefault: false,
            });
        })

        it("allows the owner to delete their own address", async () => {
            const {agent} = await customer();
            const created = await agent.post("/api/customer/addresses").send(validAddress);
            const addressId = created.body.data.address.id;

            const res = await agent.delete(`/api/customer/addresses/${addressId}`);
            expect(res.status).toBe(200);

            const list = await agent.get("/api/customer/addresses");
            expect(list.body.data).toHaveLength(0);
        })
    })

    describe("GET /api/customer/addresses/internal/:id", () => {
        it("rejects a missing api-key with 401", async () => {
            const res = await request(app).get("/api/customer/addresses/internal/1");

            expect(res.status).toBe(401);
        })

        it("returns the address with a valid api-key", async () => {
            const {agent} = await customer();
            const created = await agent.post("/api/customer/addresses").send(validAddress);
            const addressId = created.body.data.address.id;

            const res = await request(app).get(`/api/customer/addresses/internal/${addressId}`).set("api-key", INTERNAL_API_KEY);

            expect(res.status).toBe(200);
            expect(res.body.data.id).toBe(addressId);
        })

        it("returns 404 for a nonexistent address", async () => {
            const res = await request(app).get("/api/customer/addresses/internal/999999999").set("api-key", INTERNAL_API_KEY);

            expect(res.status).toBe(404);
        })
    })
})
