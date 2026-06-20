import { NextFunction, Request, Response } from "express";
import { CustomerAddressService, customerAddressService } from "../service/customer-address.service";
import { validateBody } from "../../../common/validation/validate";
import { CreateCustomerAddressDto, updateCustomerAddressDTO } from "../dto/customer-address.dto";


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

    getAddresses = async (req: Request, res: Response, next: NextFunction) => {
        try{
            // call service
            const result = await this.customerAddressService.getCustomerAddress(req.user?.userId!);

            // respond
            res.status(200).json(result);

        } catch (err) {
            next(err)
        }
    }

    updateAddress = async (req: Request, res: Response, next: NextFunction) => {
        try{
            // 1. validate req.body
            const data = await validateBody(updateCustomerAddressDTO, req.body);

            // 2. call service
            const result = await this.customerAddressService.updateCustomerAddress(req.user?.userId!, Number(req.params.addressId), data);

            // 3. respond
            res.status(200).json(result);

        } catch (err) {
            next(err)
        }
    }

    deleteAddress = async (req: Request, res: Response, next: NextFunction) => {
        try{
            // call service
            const result = await this.customerAddressService.deleteCustomerAddress(req.user?.userId!, Number(req.params.addressId));

            // respond
            res.status(200).json(result);

        } catch (err) {
            next(err)
        }
    }


}

export const customerAddressController = new CustomerAddressController(customerAddressService);