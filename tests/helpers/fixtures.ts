import request from "supertest";
import {Express} from "express";
import {db} from "../../src/lib/knex/knex";
import {hashPassword} from "../../src/app/auth/utils";
import {emailstub} from "./email-stub";

export const STRONG_PASSWORD = "StrongPass1!";
export const INTERNAL_API_KEY = "test-internal-api-key"; // matches INTERNAL_API_KEY in .env.test

let phoneSeq = 0;
export function uniquePhone(prefix = "01"): string {
    phoneSeq += 1;
    return `${prefix}${String(1_000_000_0 + phoneSeq).padStart(9, "0")}`.slice(0, 11);
}

let emailSeq = 0;
export function uniqueEmail(label = "user"): string {
    emailSeq += 1;
    return `${label}_${emailSeq}_${Date.now()}@example.com`;
}

export async function insertUser(overrides: Partial<{email: string, phone: string, name: string, systemRole: string, password: string}> = {}) {
    const now = new Date();
    const data = {
        email: overrides.email ?? uniqueEmail(),
        phone: overrides.phone ?? uniquePhone(),
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

export async function insertAdmin(overrides: Partial<{email: string, phone: string, password: string}> = {}) {
    return insertUser({...overrides, systemRole: "system_admin"});
}

/** Inserts a system_admin and logs them in, returning both the user row and a cookie-persisting agent. */
export async function adminSession(app: Express) {
    const user = await insertAdmin();
    const agent = await loginAgent(app, user.email);
    return {user, agent};
}

/** Logs in via the real API and returns a cookie-persisting supertest agent. */
export async function loginAgent(app: Express, email: string, password = STRONG_PASSWORD) {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/login").send({email, password});
    if (res.status !== 200) {
        throw new Error(`loginAgent failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return agent;
}

/** The 6-digit OTP embedded in EmailStub's captured HTML for a given recipient's most recent email. */
export function extractLatestOtp(toEmail: string): string {
    const sent = emailstub.sent.filter((m) => m.to === toEmail);
    const last = sent[sent.length - 1];
    if (!last) throw new Error(`extractLatestOtp: no email sent to ${toEmail}`);
    const match = last.html.match(/(\d{6})/);
    if (!match) throw new Error(`extractLatestOtp: no 6-digit OTP found in email to ${toEmail}`);
    return match[1];
}

/** Creates a restaurant + owner via the admin-only POST /restaurants (status=active), logs the owner in, and returns everything. */
export async function createActiveRestaurantWithOwner(app: Express, adminAgent: ReturnType<typeof request.agent>, overrides: Partial<{name: string, primaryCountry: string, ownerEmail: string, ownerPassword: string}> = {}) {
    const ownerEmail = overrides.ownerEmail ?? uniqueEmail("owner");
    const ownerPassword = overrides.ownerPassword ?? STRONG_PASSWORD;
    const res = await adminAgent.post("/api/restaurants").send({
        owner: {email: ownerEmail, phone: uniquePhone(), name: "Owner", password: ownerPassword},
        name: overrides.name ?? `Restaurant ${uniqueEmail()}`,
        primaryCountry: overrides.primaryCountry ?? "eg",
    });
    if (res.status !== 201) {
        throw new Error(`createActiveRestaurantWithOwner failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    const restaurant = res.body.data.restaurant;
    const ownerAgent = await loginAgent(app, ownerEmail, ownerPassword);
    return {restaurant, ownerEmail, ownerPassword, ownerAgent};
}

export async function createBranch(ownerAgent: ReturnType<typeof request.agent>, restaurantId: number, overrides: Record<string, any> = {}) {
    const res = await ownerAgent.post(`/api/restaurants/${restaurantId}/branches`).send({
        countryCode: "EG",
        label: "Branch",
        addressText: "1 Test St",
        lat: 30.05,
        lng: 31.24,
        opensAt: "08:00",
        closesAt: "23:00",
        deliveryRadius: 5,
        currency: "EGP",
        ...overrides,
    });
    if (res.status !== 201) {
        throw new Error(`createBranch failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.data.branch;
}

/** Invites a member via the real API, extracts the OTP from the stubbed email, accepts the invite, and logs the member in. */
export async function inviteAndActivateMember(
    app: Express,
    ownerAgent: ReturnType<typeof request.agent>,
    restaurantId: number,
    overrides: {role: string, branchIds?: number[], email?: string, password?: string},
) {
    const email = overrides.email ?? uniqueEmail(overrides.role);
    const password = overrides.password ?? STRONG_PASSWORD;
    const inviteRes = await ownerAgent.post(`/api/restaurants/${restaurantId}/members`).send({
        email,
        name: `Member ${overrides.role}`,
        phoneNumber: uniquePhone(),
        role: overrides.role,
        branchIds: overrides.branchIds ?? [],
    });
    if (inviteRes.status !== 201) {
        throw new Error(`inviteAndActivateMember: invite failed: ${inviteRes.status} ${JSON.stringify(inviteRes.body)}`);
    }
    const memberId = inviteRes.body.data.member.id;
    const otp = extractLatestOtp(email);
    const acceptRes = await request(app).post("/api/auth/accept-invite").send({email, otp, newPassword: password});
    if (acceptRes.status !== 200) {
        throw new Error(`inviteAndActivateMember: accept-invite failed: ${acceptRes.status} ${JSON.stringify(acceptRes.body)}`);
    }
    const agent = await loginAgent(app, email, password);
    return {email, password, memberId, agent};
}
