import { Router } from "express";
import { branchController } from "./controller/branch.controller";
import { authenticate } from "../../common/auth/guard";
import { rbac, requireBranchAccess, requireRestaurantMember } from "../../common/auth/rbac";


export const branchRouter = Router();

branchRouter.get("/branches/nearby", branchController.findNearby);
branchRouter.get("/restaurants/:restaurantId/branches", branchController.findByRestaurant);

branchRouter.post(
    "/restaurants/:restaurantId/branches",
    authenticate,
    requireRestaurantMember("restaurantId"),
    rbac({resource: "core:branch", action: "create"}),
    branchController.create
);

branchRouter.patch(
    "/branches/:branchId", 
    authenticate,
    requireBranchAccess("branchId"),
    rbac({resource: "core:branch", action: "update"}),
    branchController.update
);

branchRouter.patch("/branches/:branchId/status", authenticate, branchController.updateStatus); // system_admin only, checked in service