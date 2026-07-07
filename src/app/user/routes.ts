import { Router } from "express";
import { authenticate } from "../../lib/auth/guard";
import { TOKENS } from "../../lib/di/tokens";
import { UserController } from "./controller/user.controller";
import { container } from "../../lib/di/container";


export const userRouter = Router();

const userController = container.resolve<UserController>(TOKENS.UserController);

// protect
userRouter.get("/me", authenticate, userController.getMe);
userRouter.patch("/me", authenticate, userController.updateMe);
