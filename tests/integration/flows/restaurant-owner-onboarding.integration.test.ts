import "reflect-metadata"
import request from "supertest"
import {emailstub} from "../../helpers/email-stub";
import {truncateAll} from "../../helpers/db";
import {flushTestCache} from "../../helpers/redis";
import {insertAdmin, loginAgent, extractLatestOtp, uniqueEmail, uniquePhone, STRONG_PASSWORD} from "../../helpers/fixtures";

jest.mock("../../../src/lib/email/init", () => ({
    emailProvider: emailstub
}))

import {createApp} from "../../../src/app";

const app = createApp();

/**
 * End-to-end restaurant-owner onboarding flow:
 * self-serve register (restaurant_user + restaurant data, status=pending)
 * -> admin approves (status=active)
 * -> owner creates a branch
 * -> owner creates a product with a category
 * -> owner invites a staff member
 * -> staff accepts the invite via the OTP emailed to them
 * -> staff logs in and their role's permissions are enforced (read allowed, create denied)
 */
describe("flow: restaurant owner onboarding", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushTestCache();
        emailstub.reset();
    })

    it("takes a new restaurant from self-serve registration through to a permission-enforced staff account", async () => {
        const ownerEmail = uniqueEmail("owner");
        const ownerAgent = request.agent(app);

        // 1. Self-serve register as a restaurant_user with restaurant data.
        const register = await ownerAgent.post("/api/auth/register").send({
            email: ownerEmail,
            phone: uniquePhone(),
            name: "New Owner",
            password: STRONG_PASSWORD,
            role: "restaurant_user",
            restaurant: {name: "Fresh Start Diner", primaryCountry: "eg"},
        });
        expect(register.status).toBe(201);
        expect(register.body.data.restaurant.status).toBe("pending");
        const restaurantId = register.body.data.restaurant.id;

        // 2. A pending restaurant is not yet a fully operating business, but the
        //    owner can still set it up -- branch/product creation isn't gated on
        //    restaurant status.
        const branchRes = await ownerAgent.post(`/api/restaurants/${restaurantId}/branches`).send({
            countryCode: "EG", label: "Main Branch", addressText: "1 Fresh St",
            lat: 30.05, lng: 31.24, opensAt: "08:00", closesAt: "22:00",
            deliveryRadius: 5, currency: "EGP",
        });
        expect(branchRes.status).toBe(201);
        const branchId = branchRes.body.data.branch.id;

        const productRes = await ownerAgent.post(`/api/restaurants/${restaurantId}/products`).send({
            name: "House Special", categoryName: "Mains",
        });
        expect(productRes.status).toBe(201);

        // 3. Admin reviews and activates the restaurant.
        const admin = await insertAdmin();
        const adminAgent = await loginAgent(app, admin.email);
        const activate = await adminAgent.patch(`/api/restaurants/${restaurantId}/status`).send({status: "active"});
        expect(activate.status).toBe(200);
        expect(activate.body.data.restaurant.status).toBe("active");

        // 4. The now-active restaurant and its branch are publicly browsable.
        const publicList = await request(app).get("/api/restaurants?filter[status][eq]=active");
        expect(publicList.body.data.some((r: any) => r.id === restaurantId)).toBe(true);

        // 5. Owner invites a staff member.
        const staffEmail = uniqueEmail("staff");
        const invite = await ownerAgent.post(`/api/restaurants/${restaurantId}/members`).send({
            email: staffEmail, name: "New Staff", phoneNumber: uniquePhone(),
            role: "staff", branchIds: [branchId],
        });
        expect(invite.status).toBe(201);
        expect(emailstub.sent.some((m) => m.to === staffEmail)).toBe(true);

        // 6. Staff accepts the invite using the OTP from their (stubbed) email.
        const otp = extractLatestOtp(staffEmail);
        const staffPassword = "StaffOnboard1!";
        const accept = await request(app).post("/api/auth/accept-invite").send({email: staffEmail, otp, newPassword: staffPassword});
        expect(accept.status).toBe(200);

        // 7. Staff logs in and their role's permissions are enforced end-to-end.
        const staffLogin = await request(app).post("/api/auth/login").send({email: staffEmail, password: staffPassword});
        expect(staffLogin.status).toBe(200);
        expect(staffLogin.body.data.user.email).toBe(staffEmail);
        const staffAgent = request.agent(app);
        await staffAgent.post("/api/auth/login").send({email: staffEmail, password: staffPassword});

        const staffRead = await staffAgent.get(`/api/restaurants/${restaurantId}/products`);
        expect(staffRead.status).toBe(200);
        expect(staffRead.body.data.some((p: any) => p.name === "House Special")).toBe(true);

        const staffCreate = await staffAgent.post(`/api/restaurants/${restaurantId}/products`).send({name: "Staff Cannot Add This"});
        expect(staffCreate.status).toBe(403);
    })
})
