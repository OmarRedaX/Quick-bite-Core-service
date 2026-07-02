import { Knex } from "knex"
import { UpdateUserDTO } from "../dto/user.dto"
import { UserNotFoundError } from "../errors"
import { createUser, findUserById, findUserExistsByEmailOrPhone, updateUser} from "../repository/users.repo"
import { UserAlreadyExistsError } from "../../auth/errors"
import { SystemRole } from "../enums"
import { hashPassword } from "../../auth/utlis"
import { User } from "../entity/user.entity"

export interface CreateUserData {
    email: string;
    phone: string;
    name: string;
    password: string;
    systemRole: SystemRole;
}


export class UserService {

    create = async (data: CreateUserData, trx?: Knex | Knex.Transaction): Promise<User> => {
        const existing = await findUserExistsByEmailOrPhone(data.email, data.phone);
        if (existing) throw UserAlreadyExistsError;

        const hashedPassword = data.password ? await hashPassword(data.password) : '';

        const now = new Date();
        return await createUser({
            email: data.email,
            phone: data.phone,
            name: data.name,
            passwordHash: hashedPassword,
            systemRole: data.systemRole,
            createdAt: now,
            updatedAt: now
        }, trx);
    }

    getByUserId = async (userId: number) => {
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