import { findUserById } from "../../user/repository/users.repo";
import { CreateCustomerAddressDto } from "../dto/customer-address.dto";
import { UserNotFound } from "../errors";
import { createCustomerAddress } from "../repository/customer-address.repo";


export class CustomerAddressService {

    createCustomerAddress = async(userId: number, data: CreateCustomerAddressDto) => {
        // 1. find the user 
        const user = await findUserById(userId);
        if(!user) {
            throw UserNotFound;
        }

        // 2. create the customer address
        const now = new Date();
        const createdCustomerAddress = await createCustomerAddress({
            userId: user.id,
            createdAt: now,
            ...data
        });

        // 3. return the created customer address
        return {
            message: "Address added",
            address: createdCustomerAddress
        };
    }
}

export const customerAddressService = new CustomerAddressService();