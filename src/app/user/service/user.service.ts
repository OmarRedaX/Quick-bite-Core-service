import { UpdateUserDTO } from "../dto/user.dto"
import { UserNotFoundError } from "../errors"
import { findUserById, updateUserNameAndPhone } from "../repository/users.repo"


export class UserService {

    getByUserId = async(userId: number) => {
        // 1. find user by ID
        const user = await findUserById(userId)
        if(!user) {
            throw UserNotFoundError
        }

        // 2. return user data
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone,
            systemRole: user.systemRole
        }
    }

    updateUser = async(userId: number , data: UpdateUserDTO) => {
         // 1. find user by ID
        const user = await findUserById(userId)
        if(!user) {
            throw UserNotFoundError
        }

        // 2. update user name & phone
        const updatedUser = await updateUserNameAndPhone(user.id, data);

        // return user data
        return {
            "message": "Profile updated",
            user:{
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                phone: updatedUser.phone,
                systemRole: updatedUser.systemRole
            }
        }
    }

}

export const userService = new UserService()