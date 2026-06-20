import { Router } from "express";
import { healthRouter } from "./app/health/health.routes";
import { authRouter } from "./app/auth/routes";
import { userRouter } from "./app/user/routes";
import {customerAddressRouter} from "./app/customer-address/routes";

export const routes = Router();

routes.use("/health", healthRouter);

//user
routes.use("/user", userRouter);
//auth
routes.use("/auth", authRouter);
// customer
routes.use("/customer/addresses", customerAddressRouter);
//menu

//restaurant