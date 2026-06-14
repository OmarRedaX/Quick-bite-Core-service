import express from "express";
import { routes } from "./routes"
import { correlationId } from "./common/correlation/correlationId" 
import { errorHandler } from "./common/error/errorHandler" 

export function createApp() {
  const app = express();
  app.use(express ());
  app.use(correlationId);
  app.use("/api", routes);
  app.use(errorHandler);
  return app;
}
