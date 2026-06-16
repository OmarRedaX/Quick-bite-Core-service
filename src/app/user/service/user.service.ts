import { UserNotFoundError } from "../errors"
import { findUserById } from "../repository/users.repo"


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

}

export const userService = new UserService()