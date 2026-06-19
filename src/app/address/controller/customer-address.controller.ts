import { NextFunction, Request, Response } from "express";
import { CustomerAddressService, customerAddressService } from "../service/customer-address.service";
import { validateBody } from "../../../common/validation/validate";
import { CreateCustomerAddressDto } from "../dto/customer-address.dto";


export class CustomerAddressController {

    constructor(private readonly customerAddressService: CustomerAddressService){}

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            // 1. vaildate req.body
            const data = await validateBody(CreateCustomerAddressDto, req.body);

            // 2. call service 
            const result = await this.customerAddressService.createCustomerAddress(req.user?.userId!,data);

            // 3. respond
            res.status(201).json(result);

        } catch (err) {
            next(err)
        }
    }


}

export const customerAddressController = new CustomerAddressController(customerAddressService);