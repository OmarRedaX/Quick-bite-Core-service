import { Router } from "express";
import { memberController } from "./controller/member.controller";
import { authenticate } from "../../common/auth/guard";
import { rbac, requireRestaurantMember } from "../../common/auth/rbac";


export const memberRouter = Router();

// GET /roles/:role/permissions — public
memberRouter.get("/roles/:role/permissions", memberController.getRolePermissions);

// POST /restaurants/:restaurantId/members — create/invite member
memberRouter.post(
    "/restaurants/:restaurantId/members",
    authenticate,
    requireRestaurantMember('restaurantId'),
    rbac({ resource: "core:member", action: "create" }),
    memberController.createMember
);

// GET /restaurants/:restaurantId/members — list members
memberRouter.get(
    "/restaurants/:restaurantId/members",
    authenticate,
    requireRestaurantMember('restaurantId'),
    rbac({ resource: "core:member", action: "read" }),
    memberController.listMembers
);

// PATCH /restaurants/:restaurantId/members/:memberId — update member
memberRouter.patch(
    "/restaurants/:restaurantId/members/:memberId",
    authenticate,
    requireRestaurantMember('restaurantId'),
    rbac({ resource: "core:member", action: "update" }),
    memberController.updateMember
);

// DELETE /restaurants/:restaurantId/members/:memberId — delete member
memberRouter.delete(
    "/restaurants/:restaurantId/members/:memberId",
    authenticate,
    requireRestaurantMember('restaurantId'),
    rbac({ resource: "core:member", action: "delete" }),
    memberController.deleteMember
);

// PUT /restaurants/:restaurantId/members/:memberId/branches — update branch assignments
memberRouter.put(
    "/restaurants/:restaurantId/members/:memberId/branches",
    authenticate,
    requireRestaurantMember('restaurantId'),
    rbac({ resource: "core:member", action: "update" }),
    memberController.updateMemberBranches
);
