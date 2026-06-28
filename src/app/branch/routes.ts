import { Router } from "express";
import { branchController } from "./controller/branch.controller";
import { authenticate } from "../../common/auth/guard";


export const branchRouter = Router();

branchRouter.get("/branches/nearby", branchController.findNearby);
branchRouter.get("/restaurants/:restaurantId/branches", branchController.findByRestaurant);
branchRouter.post("/restaurants/:restaurantId/branches", authenticate, branchController.create);
branchRouter.patch("/branches/:branchId", authenticate, branchController.update);
branchRouter.patch("/branches/:branchId/status", authenticate, branchController.updateStatus);