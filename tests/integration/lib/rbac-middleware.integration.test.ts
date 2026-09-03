import "reflect-metadata"
import {Request, Response} from "express";
import {rbac, requireRestaurantMember, requireBranchAccess} from "../../../src/lib/auth/rbac";
import {NotAuthenticated} from "../../../src/lib/auth/errors";

function mockRes() {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
}

describe("rbac()", () => {
    it("passes the NotAuthenticated error to next() when req.user is missing", async () => {
        const middleware = rbac({resource: "core:branch", action: "create"});
        const req = {} as Request;
        const res = mockRes();
        const next = jest.fn();

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledWith(NotAuthenticated);
    })

    it("bypasses the permission check for a system_admin", async () => {
        const middleware = rbac({resource: "core:branch", action: "create"});
        const req = {user: {userId: 1, role: "system_admin", email: "a@b.com"}} as Request;
        const res = mockRes();
        const next = jest.fn();

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    })

    it("does not bypass system_admin when allowSystemAdmin is explicitly false", async () => {
        const middleware = rbac({resource: "core:branch", action: "create", allowSystemAdmin: false});
        const req = {user: {userId: 1, role: "system_admin", email: "a@b.com"}} as Request;
        const res = mockRes();
        const next = jest.fn();

        await middleware(req, res, next);

        // falls through past the restaurant_user branch too (role isn't restaurant_user) -> final 403
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    })

    it("returns 403 Permission denied for a role that is neither system_admin nor restaurant_user", async () => {
        const middleware = rbac({resource: "core:branch", action: "create"});
        const req = {user: {userId: 1, role: "customer", email: "a@b.com"}} as Request;
        const res = mockRes();
        const next = jest.fn();

        await middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({error: "Permission denied"});
        expect(next).not.toHaveBeenCalled();
    })
})

describe("requireRestaurantMember()", () => {
    it("defaults to the 'restaurantId' param name when none is given", () => {
        const middleware = requireRestaurantMember();
        const req = {params: {restaurantId: "1"}, user: {role: "system_admin"}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
    })

    it("returns 500 when the restaurantId param is missing/non-numeric", () => {
        const middleware = requireRestaurantMember("restaurantId");
        const req = {params: {restaurantId: "not-a-number"}, user: {role: "customer"}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(next).not.toHaveBeenCalled();
    })

    it("bypasses the membership check for a system_admin", () => {
        const middleware = requireRestaurantMember("restaurantId");
        const req = {params: {restaurantId: "1"}, user: {role: "system_admin", restaurantId: 999}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
        expect(res.status).not.toHaveBeenCalled();
    })

    it("returns 403 when the caller belongs to a different restaurant", () => {
        const middleware = requireRestaurantMember("restaurantId");
        const req = {params: {restaurantId: "1"}, user: {role: "restaurant_user", restaurantId: 2}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    })

    it("calls next() when the caller's restaurantId matches", () => {
        const middleware = requireRestaurantMember("restaurantId");
        const req = {params: {restaurantId: "1"}, user: {role: "restaurant_user", restaurantId: 1}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
    })
})

describe("requireBranchAccess()", () => {
    it("defaults to the 'branchId' param name when none is given", () => {
        const middleware = requireBranchAccess();
        const req = {params: {}, query: {}, user: {role: "system_admin"}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
    })

    it("bypasses the branch check for a system_admin", () => {
        const middleware = requireBranchAccess("branchId");
        const req = {params: {}, query: {}, user: {role: "system_admin"}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
    })

    it("bypasses the branch check for any restaurant owner regardless of which branch", () => {
        const middleware = requireBranchAccess("branchId");
        const req = {params: {branchId: "999"}, query: {}, user: {role: "restaurant_user", restaurantRole: "owner", branchIds: []}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
    })

    it("lets a non-owner request through when no branchId is specified at all", () => {
        const middleware = requireBranchAccess("branchId");
        const req = {params: {}, query: {}, user: {role: "restaurant_user", restaurantRole: "branch_manager", branchIds: [1]}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
    })

    it("returns 403 when the branch is specified but not in the caller's branchIds", () => {
        const middleware = requireBranchAccess("branchId");
        const req = {params: {branchId: "5"}, query: {}, user: {role: "restaurant_user", restaurantRole: "branch_manager", branchIds: [1, 2]}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    })

    it("calls next() when the branch is in the caller's branchIds", () => {
        const middleware = requireBranchAccess("branchId");
        const req = {params: {branchId: "1"}, query: {}, user: {role: "restaurant_user", restaurantRole: "branch_manager", branchIds: [1, 2]}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
    })

    it("reads branchId from the query string when there's no route param (e.g. PATCH /products/:id?branchId=)", () => {
        const middleware = requireBranchAccess("branchId");
        const req = {params: {}, query: {branchId: "3"}, user: {role: "restaurant_user", restaurantRole: "branch_manager", branchIds: [3]}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledWith();
    })

    it("defaults branchIds to empty when absent, rejecting any specified branch", () => {
        const middleware = requireBranchAccess("branchId");
        const req = {params: {branchId: "1"}, query: {}, user: {role: "restaurant_user", restaurantRole: "staff"}} as unknown as Request;
        const res = mockRes();
        const next = jest.fn();

        middleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
    })
})
