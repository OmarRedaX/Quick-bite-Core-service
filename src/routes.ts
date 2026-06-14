import { Router } from "express";
import { healthRouter } from "./app/health/health.routes";

export const routes = Router();

routes.use("/health", healthRouter);
