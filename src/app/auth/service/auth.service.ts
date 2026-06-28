import { db } from "../../../common/knex/knex";
import { createRestaurant } from "../../restaurant/repository/restaurant.repo";
import { restaurantService, RestaurantService } from "../../restaurant/service/restaurant.service";
import { SystemRole } from "../../user/enums";
import { createUser, findUserByEmail, findUserExistsByEmailOrPhone, updateUserPassword } from "../../user/repository/users.repo";
import { ForgetPasswordDTO, LoginDTO, RegisterDTO, ResetPasswordDTO } from "../dto/auth.dto";
import { CannotSignupAsSystemAdmin, IncorrectCredentials, InvalidOTPError, RestaurantDataRequiredError, UserAlreadyExistsError } from "../errors";
import { createPasswordReset, findLatestPasswordResetByUserId, updatePasswordResetConsumedAt } from "../repository/password-reset.repo";
import { comparePassword, createAccessToken, createRefreshToken, generateOTP, hashOTP, hashPassword, verifyRefreshToken } from "../utlis";

export class AuthService {

    constructor(private readonly restaurantService: RestaurantService) {}

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

        const trx = await db.transaction();
        let user;
        let restaurant;

        try{
            user = await createUser({
                email: data.email,
                phone: data.phone,
                name: data.name,
                passwordHash: hashedPassword,
                systemRole: data.role,
                createdAt: now,
                updatedAt: now
            }, trx);

            // check if the type of user is restaurant then call restaurant service to create a new restaurant
            if(data.role == SystemRole.RESTAURANT_USER) {
                if(data.restaurant == undefined) {
                    throw RestaurantDataRequiredError;
                }
                restaurant = await this.restaurantService.create(user.id, data.restaurant, trx)
            }

            await trx.commit();
            
        } catch(err){
            await trx.rollback();
            throw err;
        }
        

        // 5. create access token , refresh token
        const payload = {userId: user.id, email: user.email, role: user.systemRole};
        const accessToken = createAccessToken(payload);
        const refreshToken = createRefreshToken(payload);

        // 6. return tokens and user data
        return {
            message: "Successfully registered user",
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                phone: user.phone,
                name: user.name,
                systemRole: user.systemRole,
                createdAt: user.createdAt
            },
            restaurant
        };
    }

    login = async(data: LoginDTO) => {
        // 1. find the user by emai input
        const user = await findUserByEmail(data.email);
        if(!user){
            throw IncorrectCredentials
        }

        // 2. compare password
        const match = await comparePassword(data.password, user.passwordHash);


        // 3. if password doesn't match throw error
        if(!match){
            throw IncorrectCredentials;
        }

        // generate tokens
        const payload = {userId: user.id, email: user.email, role: user.systemRole};
        const accessToken = createAccessToken(payload);
        const refreshToken = createRefreshToken(payload);

        // return the data
        return {
            message: "Login successful",
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                phone: user.phone,
                name: user.name,
                systemRole: user.systemRole,
                createdAt: user.createdAt
            }
        }
    }

    forgetPassword = async(data: ForgetPasswordDTO) => {
        // check if user exists
        const user = await findUserByEmail(data.email);
        if(!user){
            return
        }

        // generate an otp
        const otp = generateOTP();
        // hash the otp
        const hashedOtp = hashOTP(otp);

        // insert the otp
        await createPasswordReset({
            userId: user.id,
            otpHash: hashedOtp,
            expiresAt: new Date( Date.now() + (10*60*1000) ), 
            createdAt: new Date()
        })

        // TODO: send email
        console.log(`mocked email sent ${otp}`)
    }

    resetPassword = async (data: ResetPasswordDTO) => {
        // 1. check if user exists
        const user = await findUserByEmail(data.email);
        if(!user){
            throw InvalidOTPError
        }

        // 2. find reset password
        const reset = await findLatestPasswordResetByUserId(user.id);
        if(!reset){
            throw InvalidOTPError
        }

        // 3. verify the OTP
        const inputOTPHashed = hashOTP(data.otp);
        if(inputOTPHashed != reset.otpHash || reset.isExpired()){
            throw InvalidOTPError
        }

        // 4. update user password 
        const newHashPassword = await hashPassword(data.newPassword);
        await updateUserPassword(user.id, newHashPassword);

        // 5. update reset password
        await updatePasswordResetConsumedAt(reset.id);
    }

    refresh = async(refreshToken: string) => {
        if (!refreshToken) {
            throw IncorrectCredentials;
        }
        const payload = verifyRefreshToken(refreshToken);
        const accessToken = createAccessToken({userId: payload.userId, role: payload.role, email: payload.email});
        return {accessToken};
    }
}


export const authService = new AuthService(restaurantService);
