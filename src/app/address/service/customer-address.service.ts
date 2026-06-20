import { findUserById } from "../../user/repository/users.repo";
import { CreateCustomerAddressDto } from "../dto/customer-address.dto";
import { UserNotFound } from "../errors";
import { createCustomerAddress, deleteCustomerAddress, findCustomerAddress, updateCustomerAddress } from "../repository/customer-address.repo";


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

    getCustomerAddress = async(userId: number) => {
        // find user
        const user = await findUserById(userId);
        if(!user) {
            throw UserNotFound;
        }

        // return customer address using userId
        const data = await findCustomerAddress(user.id);
     
        return {
            data: data
        }
    }

    updateCustomerAddress = async(userId: number, addressId: number, data: Partial<CreateCustomerAddressDto>) => {
        // find user
        const user = await findUserById(userId);
        if(!user) {
            throw UserNotFound;
        }

        // update customer address
        const updatedAddress = await updateCustomerAddress(addressId, userId, data);
        return {
            message: "Address updated",
            address: updatedAddress
        };
    }

    deleteCustomerAddress = async(userId: number, addressId: number) => {
        // find user
        const user = await findUserById(userId);
        if(!user) {
            throw UserNotFound;
        }

        // delete customer address
        await deleteCustomerAddress(addressId, userId);

        return {
            message: "Address deleted"
        };
    }
}

export const customerAddressService = new CustomerAddressService();