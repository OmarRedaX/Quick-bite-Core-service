import { Router } from "express";
import { userController } from "./controller/user.controller";
import { authenticate } from "../../common/auth/guard";


export const userRoutes = Router();

userRoutes.get("/me", authenticate, userController.getMe);