import { Router } from "express";
import { restaurantController } from "./controller/restaurant.controller";
import { authenticate } from "../../common/auth/guard";
import { rbac, requireRestaurantMember } from "../../common/auth/rbac";


export const restaurantRouter = Router();

restaurantRouter.get("/", restaurantController.getAll);
restaurantRouter.get("/:id", restaurantController.getById);

restaurantRouter.post("/", authenticate, restaurantController.create); // system_admin only, checked in service

restaurantRouter.patch(
    "/:id",
    authenticate,
    requireRestaurantMember("id"),
    rbac({resource:"core:restaurant", action:"update"}),
    restaurantController.update
);

restaurantRouter.patch("/:id/status", authenticate, restaurantController.updateStatus); // system_admin only, checked in service