import { Router } from "express";
import { healthRouter } from "./app/health/health.routes";
import { authRouter } from "./app/auth/routes";
import { userRoutes } from "./app/user/routes";
import { customerAddressRoutes } from "./app/address/routes";

export const routes = Router();

routes.use("/health", healthRouter);

//user
routes.use("/user", userRoutes);
//auth
routes.use("/auth", authRouter);
// customer
routes.use("/customer", customerAddressRoutes);
//menu

//restaurant