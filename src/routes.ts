import {Router} from "express";
import {authRouter} from "./app/auth/routes";
import {branchRouter} from "./app/branch/routes";
import {healthRouter} from "./app/health/health.routes";
import {rbacRouter} from "./app/rbac/routes";
import {restaurantRouter} from "./app/restaurant/routes";
import {userRouter} from "./app/user/routes";
import {customerAddressRouter} from "./app/customer-address/routes";
import {productRouter} from "./app/product/routes";

export const routes = Router();

routes.use("/health", healthRouter);
routes.use('/user', userRouter)
routes.use('/auth', authRouter);
routes.use('/customer/addresses', customerAddressRouter);
routes.use('/restaurants', restaurantRouter)
routes.use('/', branchRouter)
routes.use('/', productRouter)
routes.use('/', rbacRouter)
