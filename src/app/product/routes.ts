import { Router } from "express";
import { authenticate } from "../../lib/auth/guard";
import { rbac, requireBranchAccess, requireRestaurantMember, } from "../../lib/auth/rbac";
import { TOKENS } from "../../lib/di/tokens";
import { ProductController } from "./controller/product.controller";
import { container } from "../../lib/di/container";

export const productRouter = Router();

const productController = container.resolve<ProductController>(TOKENS.ProductController);

productRouter.get(
  "/restaurants/:restaurantId/categories",
  requireRestaurantMember("restaurantId"),
  productController.findCategories,
);
productRouter.get(
  "/restaurants/:restaurantId/products",
  authenticate,
  productController.findByRestaurant,
);
productRouter.get(
  "/branches/:branchId/products",
  productController.findByBranch,
);
productRouter.get("/products/:id", productController.findById);
productRouter.post(
  "/restaurants/:restaurantId/products",
  authenticate,
  requireRestaurantMember("restaurantId"),
  rbac({ resource: "core:product", action: "create" }),
  productController.create,
);
productRouter.patch(
  "/products/:id",
  authenticate,
  requireBranchAccess("branchId"),
  rbac({ resource: "core:product", action: "update" }),
  productController.update,
);
