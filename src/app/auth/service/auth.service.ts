import { db } from "../../../common/knex/knex";
import { toMs } from "../../../common/utils/time.utils";
import { findBranchIdsByMemberId } from "../../rbac/repo/member-branch.repo";
import { activateMemberByUserId, findRestaurantMemberWithRole } from "../../rbac/repo/restaurant-member.repo";
import { memberService, MemberService } from "../../rbac/service/member.service";
import { restaurantService, RestaurantService } from "../../restaurant/service/restaurant.service";
import { SystemRole } from "../../user/enums";
import { createUser, findUserByEmail, findUserExistsByEmailOrPhone, updateUserPassword } from "../../user/repository/users.repo";
import { userService, UserService } from "../../user/service/user.service";
import { ForgetPasswordDTO, LoginDTO, RegisterDTO, ResetPasswordDTO } from "../dto/auth.dto";
import { CannotSignupAsSystemAdmin, IncorrectCredentials, InvalidOTPError, RestaurantDataRequiredError, UserAlreadyExistsError } from "../errors";
import { createPasswordReset, findLatestPasswordResetByUserId, updatePasswordResetConsumedAt } from "../repository/password-reset.repo";
import { comparePassword, createAccessToken, createRefreshToken, generateOTP, hashOTP, hashPassword, verifyRefreshToken } from "../utlis";

export class AuthService {

    constructor(
        private readonly userService: UserService, 
        private readonly memberService: MemberService, 
        private readonly restaurantService: RestaurantService
    ) {}

    register = async(data: RegisterDTO) => {
        if (data.role == SystemRole.SYSTEM_ADMIN) {
            throw CannotSignupAsSystemAdmin
        }

        const trx = await db.transaction();
        let user;
        let restaurant;
        let restaurantMemberInfo: {restaurantId?: number, restaurantRole?: string, branchIds?: number[]} = {};

        try{
            user = await this.userService.create({
                email: data.email,
                phone: data.phone,
                name: data.name,
                password: data.password,
                systemRole: data.role,
            }, trx);

            // check if the type of user is restaurant then call restaurant service to create a new restaurant
            if(data.role == SystemRole.RESTAURANT_USER) {
                if(data.restaurant == undefined) {
                    throw RestaurantDataRequiredError;
                }
                restaurant = await this.restaurantService.create(user.id, data.restaurant, trx)
                // insert the member
                await this.memberService.createOwnerMember(restaurant.id, user.id, trx);
                restaurantMemberInfo = {
                    restaurantId: restaurant.id,
                    restaurantRole: 'owner',
                    branchIds: []
                };
            }

            await trx.commit();
            
        } catch(err){
            await trx.rollback();
            throw err;
        }
        

        // 5. create access token , refresh token and set the member info for jwt payload
        const payload = {userId: user.id, email: user.email, role: user.systemRole, ...restaurantMemberInfo};
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

        let restaurantMemberInfo = null;
        if(user.systemRole === SystemRole.RESTAURANT_USER) {
            const memberData = await findRestaurantMemberWithRole(user.id);
            const branchIds = await findBranchIdsByMemberId(memberData.member.id);
            if(memberData) {
                restaurantMemberInfo = {
                    restaurantId: memberData.member.restaurantId,
                    restaurantRole: memberData.roleName,
                    branchIds
                }
            }
        }
        // generate tokens
        const payload = {userId: user.id, email: user.email, role: user.systemRole, ...restaurantMemberInfo};
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
        };
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
            expiresAt: new Date( Date.now() + toMs(10, 'm') ), 
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

        return user;
    }

    refresh = async(refreshToken: string) => {
        if (!refreshToken) {
            throw IncorrectCredentials;
        }
        const payload = verifyRefreshToken(refreshToken);
        const accessToken = createAccessToken({userId: payload.userId, role: payload.role, email: payload.email});
        return {accessToken};
    }

    acceptInvite = async(data: ResetPasswordDTO) => {
        // find user by email
        // find password_Reset table by user id
        // verify otp
        // update password
        const user = await this.resetPassword(data);

        // activate member
        await activateMemberByUserId(user.id);
    }
}


export const authService = new AuthService(userService, memberService, restaurantService);
