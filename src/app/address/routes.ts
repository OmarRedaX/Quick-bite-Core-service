import { Router } from "express";
import { customerAddressController } from "./controller/customer-address.controller";
import { authenticate } from "../../common/auth/guard";

export const customerAddressRoutes = Router()

customerAddressRoutes.post('/addresses', authenticate, customerAddressController.create);
customerAddressRoutes.get('/addresses', authenticate, customerAddressController.getAddresses);
customerAddressRoutes.patch('/addresses/:addressId', authenticate, customerAddressController.updateAddress);
customerAddressRoutes.delete('/addresses/:addressId', authenticate, customerAddressController.deleteAddress);



