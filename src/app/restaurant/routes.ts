import { Router } from "express";
import { restaurantController } from "./controller/restaurant.controller";
import { authenticate } from "../../common/auth/guard";


export const restaurantRouter = Router();

restaurantRouter.get("/", restaurantController.getAll);
restaurantRouter.get("/:id", restaurantController.getById);
restaurantRouter.post("/", authenticate, restaurantController.create);
restaurantRouter.patch("/:id", authenticate, restaurantController.update);
restaurantRouter.patch("/:id/status", authenticate, restaurantController.updateStatus);