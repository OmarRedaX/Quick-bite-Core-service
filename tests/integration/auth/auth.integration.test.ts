import "reflect-metadata"
import request from "supertest"
import { emailstub, EmailStub } from "../../helpers/email-stub";
import { truncateAll } from "../../helpers/db";
import { flushIdempotencyCache } from "../../helpers/redis";

jest.mock("../../../src/lib/email/init", () => ({
    emailProvider: emailstub
}))

import{createApp} from "../../../src/app";
import {db} from "../../../src/lib/knex/knex"
import {hashPassword, comparePassword, hashOTP} from "../../../src/app/auth/utils"

const app = createApp();

const STRONG_PASSWORD = "StrongPass1!";

async function insertUser(overrides: Partial<{email: string, phone: string, name: string, systemRole: string, password: string}> = {}) {
    const now = new Date();
    const data = {
        email: overrides.email ?? "user@example.com",
        phone: overrides.phone ?? "01011111111",
        name: overrides.name ?? "User",
        systemRole: overrides.systemRole ?? "customer",
        password: overrides.password ?? STRONG_PASSWORD,
    };
    const [row] = await db("users").insert({
        email: data.email,
        phone: data.phone,
        name: data.name,
        system_role: data.systemRole,
        created_at: now,
        updated_at: now,
        password_hash: await hashPassword(data.password),
    }).returning(["id", "email", "phone", "name", "system_role"]);
    return row;
}

async function insertRestaurantWithMember(roleName: "owner" | "branch_manager" | "staff", memberStatus: "active" | "inactive" = "active") {
    const now = new Date();
    const owner = await insertUser({email: "owner@example.com", phone: "01022222222", systemRole: "restaurant_user"});
    const [restaurant] = await db("restaurants").insert({
        owner_id: owner.id,
        name: "Tasty Bites",
        logo_url: "",
        status: "active",
        primary_country: "eg",
        created_at: now,
        updated_at: now,
        status_updated_at: now,
    }).returning(["id"]);
    const role = await db("roles").select("id").where("name", roleName).first();
    const [member] = await db("restaurant_members").insert({
        restaurant_id: restaurant.id,
        user_id: owner.id,
        role_id: role.id,
        status: memberStatus,
        created_at: now,
        updated_at: now,
    }).returning(["id"]);
    return {restaurant, user: owner, member};
}

describe("POST/api/auth/forget-passwrod", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushIdempotencyCache();
        emailstub.reset();
    })
    it("persists a reset row and emails the user", async () => {
        const now = new Date();
        await db("users").insert({
            email: "test@example.com",
            phone: "01012345678",
            name: "User",
            system_role: "customer",
            created_at: now,
            updated_at: now,
            password_hash: await hashPassword("password")
        });

        const res = await request(app).post("/api/auth/forget-password").set('Idempotency-key', 'k1').send({email: "test@example.com"})
        expect (res.status).toBe(200);
        expect(await db("password_resets").count('* as n').first()).toEqual(({ n: '1' }));

        expect(emailstub.sent[0].to).toBe("test@example.com")
    })
})

describe("POST /api/auth/register", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushIdempotencyCache();
        emailstub.reset();
    })

    it("registers a customer, hashes the password, and sets auth cookies", async () => {
        const res = await request(app).post("/api/auth/register").send({
            email: "customer@example.com",
            phone: "01011112222",
            name: "Customer One",
            password: STRONG_PASSWORD,
            role: "customer",
        });

        expect(res.status).toBe(201);
        expect(res.body.data.user).toMatchObject({
            email: "customer@example.com",
            phone: "01011112222",
            systemRole: "customer",
        });
        expect(res.body.data.accessToken).toEqual(expect.any(String));
        const cookies = res.headers["set-cookie"] as unknown as string[];
        expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true);
        expect(cookies.some((c) => c.startsWith("refresh_token="))).toBe(true);

        const row = await db("users").where("email", "customer@example.com").first();
        expect(row.password_hash).not.toBe(STRONG_PASSWORD);
        expect(await comparePassword(STRONG_PASSWORD, row.password_hash)).toBe(true);
    })

    it("registers a restaurant_user with restaurant data and creates an active owner member", async () => {
        const res = await request(app).post("/api/auth/register").send({
            email: "owner@example.com",
            phone: "01033334444",
            name: "Owner",
            password: STRONG_PASSWORD,
            role: "restaurant_user",
            restaurant: {name: "Tasty Bites", primaryCountry: "eg"},
        });

        expect(res.status).toBe(201);
        expect(res.body.data.restaurant).toMatchObject({name: "Tasty Bites"});

        const user = await db("users").where("email", "owner@example.com").first();
        const restaurant = await db("restaurants").where("owner_id", user.id).first();
        expect(restaurant).toBeTruthy();

        const member = await db("restaurant_members").where("user_id", user.id).first();
        const role = await db("roles").where("id", member.role_id).first();
        expect(role.name).toBe("owner");
        expect(member.status).toBe("active");
    })

    it("rejects restaurant_user registration without restaurant data", async () => {
        const res = await request(app).post("/api/auth/register").send({
            email: "no-restaurant@example.com",
            phone: "01055556666",
            name: "No Restaurant",
            password: STRONG_PASSWORD,
            role: "restaurant_user",
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Restaurant data is required");
        expect(await db("users").where("email", "no-restaurant@example.com").first()).toBeUndefined();
    })

    it("rejects registering as system_admin", async () => {
        const res = await request(app).post("/api/auth/register").send({
            email: "admin@example.com",
            phone: "01077778888",
            name: "Admin",
            password: STRONG_PASSWORD,
            role: "system_admin",
        });

        expect(res.status).toBe(403);
        expect(res.body.error).toBe("You cannot register as a system admin");
    })

    it("rejects a duplicate email/phone with 400", async () => {
        await insertUser({email: "dup@example.com", phone: "01099990000"});

        const res = await request(app).post("/api/auth/register").send({
            email: "dup@example.com",
            phone: "01099990001",
            name: "Duplicate",
            password: STRONG_PASSWORD,
            role: "customer",
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("User Already Exists with same phone or email");
    })

    it("rejects a weak password with a 400 validation error", async () => {
        const res = await request(app).post("/api/auth/register").send({
            email: "weak@example.com",
            phone: "01012121212",
            name: "Weak",
            password: "weak",
            role: "customer",
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Password is not strong enough/);
        expect(await db("users").where("email", "weak@example.com").first()).toBeUndefined();
    })
})

describe("POST /api/auth/login", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushIdempotencyCache();
        emailstub.reset();
    })

    it("logs in with correct credentials and sets auth cookies", async () => {
        await insertUser({email: "login@example.com", phone: "01013131313"});

        const res = await request(app).post("/api/auth/login").send({
            email: "login@example.com",
            password: STRONG_PASSWORD,
        });

        expect(res.status).toBe(200);
        expect(res.body.data.user.email).toBe("login@example.com");
        expect(res.body.data.accessToken).toEqual(expect.any(String));
        const cookies = res.headers["set-cookie"] as unknown as string[];
        expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true);
    })

    it("returns 401 for a wrong password", async () => {
        await insertUser({email: "wrongpass@example.com", phone: "01014141414"});

        const res = await request(app).post("/api/auth/login").send({
            email: "wrongpass@example.com",
            password: "WrongPass1!",
        });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe("Incorrect email or password");
    })

    it("returns 401 for an unknown email", async () => {
        const res = await request(app).post("/api/auth/login").send({
            email: "unknown@example.com",
            password: STRONG_PASSWORD,
        });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe("Incorrect email or password");
    })

    it("includes restaurant membership info for an active restaurant_user member", async () => {
        const {user} = await insertRestaurantWithMember("branch_manager");

        const res = await request(app).post("/api/auth/login").send({
            email: user.email,
            password: STRONG_PASSWORD,
        });

        expect(res.status).toBe(200);
        const {accessToken} = res.body.data;
        const {verifyAccessToken} = require("../../../src/app/auth/utils");
        const payload = verifyAccessToken(accessToken);
        expect(payload.restaurantRole).toBe("branch_manager");
        expect(payload.branchIds).toEqual([]);
    })
})

describe("POST /api/auth/reset-password", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushIdempotencyCache();
        emailstub.reset();
    })

    async function insertResetRow(userId: number, otp: string, opts: {expiresAt?: Date, consumedAt?: Date | null} = {}) {
        await db("password_resets").insert({
            user_id: userId,
            otp_hash: hashOTP(otp),
            expires_at: opts.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000),
            consumed_at: opts.consumedAt ?? null,
            created_at: new Date(),
        });
    }

    it("resets the password with a valid OTP and marks the reset consumed", async () => {
        const user = await insertUser({email: "reset@example.com", phone: "01015151515"});
        await insertResetRow(user.id, "123456");

        const res = await request(app).post("/api/auth/reset-password").send({
            email: "reset@example.com",
            otp: "123456",
            newPassword: "NewStrongPass1!",
        });

        expect(res.status).toBe(200);

        const row = await db("users").where("id", user.id).first();
        expect(await comparePassword("NewStrongPass1!", row.password_hash)).toBe(true);

        const reset = await db("password_resets").where("user_id", user.id).first();
        expect(reset.consumed_at).not.toBeNull();
    })

    it("returns 401 for a wrong OTP", async () => {
        const user = await insertUser({email: "wrongotp@example.com", phone: "01016161616"});
        await insertResetRow(user.id, "123456");

        const res = await request(app).post("/api/auth/reset-password").send({
            email: "wrongotp@example.com",
            otp: "654321",
            newPassword: "NewStrongPass1!",
        });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe("Invalid OTP");
    })

    it("returns 401 for an expired OTP", async () => {
        const user = await insertUser({email: "expired@example.com", phone: "01017171717"});
        await insertResetRow(user.id, "123456", {expiresAt: new Date(Date.now() - 60 * 1000)});

        const res = await request(app).post("/api/auth/reset-password").send({
            email: "expired@example.com",
            otp: "123456",
            newPassword: "NewStrongPass1!",
        });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe("Invalid OTP");
    })

    it("returns 401 when no reset was ever requested", async () => {
        await insertUser({email: "noreset@example.com", phone: "01018181818"});

        const res = await request(app).post("/api/auth/reset-password").send({
            email: "noreset@example.com",
            otp: "123456",
            newPassword: "NewStrongPass1!",
        });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe("Invalid OTP");
    })

    it("returns 401 for an unknown email", async () => {
        const res = await request(app).post("/api/auth/reset-password").send({
            email: "ghost@example.com",
            otp: "123456",
            newPassword: "NewStrongPass1!",
        });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe("Invalid OTP");
    })
})

describe("POST /api/auth/refresh", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushIdempotencyCache();
        emailstub.reset();
    })

    it("issues a new access_token cookie for a valid refresh token", async () => {
        await insertUser({email: "refresh@example.com", phone: "01019191919"});
        const login = await request(app).post("/api/auth/login").send({
            email: "refresh@example.com",
            password: STRONG_PASSWORD,
        });
        const loginCookies = login.headers["set-cookie"] as unknown as string[];
        const refreshCookie = loginCookies.find((c) => c.startsWith("refresh_token="))!;

        const res = await request(app).post("/api/auth/refresh").set("Cookie", refreshCookie);

        expect(res.status).toBe(200);
        const cookies = res.headers["set-cookie"] as unknown as string[];
        expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true);
    })

    it("returns 401 when no refresh token cookie is present", async () => {
        const res = await request(app).post("/api/auth/refresh");

        expect(res.status).toBe(401);
        expect(res.body.error).toBe("Incorrect email or password");
    })

    it("returns 401 for a malformed refresh token", async () => {
        const res = await request(app).post("/api/auth/refresh").set("Cookie", "refresh_token=not-a-jwt");

        expect(res.status).toBe(401);
        expect(res.body.error).toBe("Incorrect email or password");
    })
})

describe("POST /api/auth/accept-invite", () => {
    beforeEach(async () => {
        await truncateAll();
        await flushIdempotencyCache();
        emailstub.reset();
    })

    it("activates an inactive member and sets their password", async () => {
        const {user, member} = await insertRestaurantWithMember("staff", "inactive");
        await db("password_resets").insert({
            user_id: user.id,
            otp_hash: hashOTP("111111"),
            expires_at: new Date(Date.now() + 10 * 60 * 1000),
            consumed_at: null,
            created_at: new Date(),
        });

        const res = await request(app).post("/api/auth/accept-invite").send({
            email: user.email,
            otp: "111111",
            newPassword: "InviteStrong1!",
        });

        expect(res.status).toBe(200);

        const row = await db("restaurant_members").where("id", member.id).first();
        expect(row.status).toBe("active");

        const userRow = await db("users").where("id", user.id).first();
        expect(await comparePassword("InviteStrong1!", userRow.password_hash)).toBe(true);
    })

    it("returns 401 and does not activate the member for a wrong OTP", async () => {
        const {user, member} = await insertRestaurantWithMember("staff", "inactive");
        await db("password_resets").insert({
            user_id: user.id,
            otp_hash: hashOTP("111111"),
            expires_at: new Date(Date.now() + 10 * 60 * 1000),
            consumed_at: null,
            created_at: new Date(),
        });

        const res = await request(app).post("/api/auth/accept-invite").send({
            email: user.email,
            otp: "999999",
            newPassword: "InviteStrong1!",
        });

        expect(res.status).toBe(401);
        const row = await db("restaurant_members").where("id", member.id).first();
        expect(row.status).toBe("inactive");
    })
})