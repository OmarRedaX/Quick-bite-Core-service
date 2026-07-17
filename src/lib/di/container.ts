import { container } from "tsyringe";
import { TOKENS } from "./tokens";
// controllers
import { AuthController } from "../../app/auth/controller/auth.controller";
import { UserController } from "../../app/user/controller/user.controller";
import { RestaurantController } from "../../app/restaurant/controller/restaurant.controller";
import { BranchController } from "../../app/branch/controller/branch.controller";
import { MemberController } from "../../app/rbac/controller/member.controller";
import { ProductController } from "../../app/product/controller/product.controller";
import { CustomerAddressController } from "../../app/customer-address/controller/customer-address.controller";
// services
import { AuthService } from "../../app/auth/service/auth.service";
import { UserService } from "../../app/user/service/user.service";
import { RestaurantService } from "../../app/restaurant/service/restaurant.service";
import { BranchService } from "../../app/branch/service/branch.service";
import { CustomerAddressService } from "../../app/customer-address/service/customer-address.service";
import { MemberService } from "../../app/rbac/service/member.service";
import { ProductService } from "../../app/product/service/product.service";
import { PermissionCacheService } from "../../app/rbac/service/permission-cache.service";
// infastructure
import { Logger } from "../logger/logger";
import { cacheProvider } from "../cache/init";
import { emailProvider } from "../email/init";


container.registerSingleton(TOKENS.Logger, Logger);

container.registerSingleton(TOKENS.AuthService, AuthService);
container.registerSingleton(TOKENS.UserService, UserService);
container.registerSingleton(TOKENS.RestaurantService, RestaurantService);
container.registerSingleton(TOKENS.BranchService, BranchService);
container.registerSingleton(TOKENS.MemberService, MemberService);
container.registerSingleton(TOKENS.ProductService, ProductService);
container.registerSingleton(TOKENS.CustomerAddressService, CustomerAddressService);
container.registerSingleton(TOKENS.PermissionCacheService, PermissionCacheService);

container.registerSingleton(TOKENS.AuthController, AuthController);
container.registerSingleton(TOKENS.UserController, UserController);
container.registerSingleton(TOKENS.RestaurantController, RestaurantController);
container.registerSingleton(TOKENS.BranchController, BranchController);
container.registerSingleton(TOKENS.MemberController, MemberController);
container.registerSingleton(TOKENS.ProductController, ProductController);
container.registerSingleton(TOKENS.CustomerAddressController, CustomerAddressController);

container.registerInstance(TOKENS.CacheProvider, cacheProvider);

container.registerInstance(TOKENS.EmailProvider, emailProvider);

export { container };