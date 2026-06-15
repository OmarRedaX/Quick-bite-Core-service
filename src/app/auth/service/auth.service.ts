import { SystemRole } from "../../user/enums";
import { createUser, findUserExistsByEmailOrPhone } from "../../user/repository/users.repo";
import { RegisterDTO } from "../dto/auth.dto";
import { CannotSignupAsSystemAdmin, UserAlreadyExistsError } from "../errors";
import { createAccessToken, createRefreshToken, hashPassword } from "../utlis";

export class AuthService {

    register = async(data: RegisterDTO) => {
        if (data.role == SystemRole.SYSTEM_ADMIN) {
            throw CannotSignupAsSystemAdmin
        }

        // 1. check if user exists by email or phone
        const existing = await findUserExistsByEmailOrPhone(data.email, data.phone);

        // 2. if exists we throw an console.error
        if (existing) {
            throw UserAlreadyExistsError;
        }

        // 3. hashPawssword
        const hashedPassword = await hashPassword(data.password);

        // 4. create user
        const now = new Date();
        const user = await createUser({
            email: data.email,
            phone: data.phone,
            name: data.name,
            passwordHash: hashedPassword,
            systemRole: data.role,
            createdAt: now,
            updatedAt: now
        });

        // 5. create access token , refresh token
        const payload = {userId: user.id, email: user.email, role: user.systemRole};
        const accessToken = createAccessToken(payload);
        const refreshToken = createRefreshToken(payload);

        // 6. return tokens and user data
        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                phone: user.phone,
                name: user.name,
                systemRole: user.systemRole
            }
        };
    }
}


export const authService = new AuthService();
