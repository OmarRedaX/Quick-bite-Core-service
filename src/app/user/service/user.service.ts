import { UpdateUserDTO } from "../dto/user.dto"
import { UserNotFoundError } from "../errors"
import { findUserById, updateUser} from "../repository/users.repo"


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

    updateProfile = async (userId: number, data: UpdateUserDTO) => {
        const user = await findUserById(userId);
        if (!user) {
            throw UserNotFoundError;
        }
        const updated = await updateUser(userId, data);
        return {
            id: updated.id,
            email: updated.email,
            name: updated.name,
            phone: updated.phone,
            systemRole: updated.systemRole,
        };
    }

}

export const userService = new UserService()