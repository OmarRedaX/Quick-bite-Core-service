import { Router } from "express";
import { healthRouter } from "./app/health/health.routes";
import { authRouter } from "./app/auth/routes";
import { userRouter } from "./app/user/routes";
import {customerAddressRouter} from "./app/customer-address/routes";
import { restaurantRouter } from "./app/restaurant/routes";
import { branchRouter } from "./app/branch/routes";
import { productRouter } from "./app/product/routes";
import { memberRouter } from "./app/rbac/routes";

export const routes = Router();

routes.use("/health", healthRouter);

//user
routes.use("/user", userRouter);
//auth
routes.use("/auth", authRouter);
//customer
routes.use("/customer/addresses", customerAddressRouter);
//menu

//restaurants
routes.use("/restaurant", restaurantRouter);
//branches
routes.use("/", branchRouter);
// products
routes.use('/', productRouter)
// members
routes.use("/", memberRouter);