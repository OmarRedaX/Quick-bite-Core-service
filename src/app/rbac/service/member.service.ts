import { Knex } from "knex";
import { db } from "../../../common/knex/knex";
import { toMs } from "../../../common/utils/time.utils";
import { UserAlreadyExistsError } from "../../auth/errors";
import { createPasswordReset } from "../../auth/repository/password-reset.repo";
import { generateOTP, hashOTP } from "../../auth/utlis";
import { SystemRole } from "../../user/enums";
import { createUser, findUserByEmail } from "../../user/repository/users.repo";
import { CreateMemberDTO, UpdateMemberBranchesDTO, UpdateMemberDTO } from "../dto/member.dto";
import { MemberBranch } from "../entity/member-branch.entity";
import { MemberStatus } from "../enums";
import { CannotCreateOwnerUserError, CannotDeleteOwnerError, CannotUpdateOwnerBranchesError, InvalidBranchIdsError, MemberNotFoundError, RoleNotFoundError } from "../errors";
import { countBranchesByIdsAndRestaurant, setMemberBranches } from "../repo/member-branch.repo";
import { getPermissionDetailsByRoleName } from "../repo/permission.repo";
import { createRestaurantMember, deleteMember, findMemberWithRoleName, findMemfbersByRestaurantId, updateMember } from "../repo/restaurant-member.repo";
import { findRoleByName } from "../repo/role.repo";
import { userService, UserService } from "../../user/service/user.service";

async function validateBranchOwnership(branchIds: number[], restaurantId: number) {
    if (branchIds.length === 0) return;
    const count = await countBranchesByIdsAndRestaurant(branchIds, restaurantId);
    if (count !== branchIds.length) {
        throw InvalidBranchIdsError;
    }
}


export class MemberService {

    constructor(private readonly userService: UserService) { }

    createOwnerMember = async (restaurantId: number, userId: number, trx?: Knex.Transaction) => {
        // looks up the owner role by name 
        const ownerRoleId = await findRoleByName('owner', trx);
        if (!ownerRoleId) throw RoleNotFoundError;

        const now = new Date();
        return await createRestaurantMember({
            userId,
            restaurantId,
            roleId: ownerRoleId,
            status: MemberStatus.ACTIVE,
            createdAt: now,
            updatedAt: now,
        }, trx);
    }

    createMember = async (restaurantId: number, data: CreateMemberDTO) => {
        // don't accept owner role creation 
        if(data.role === 'owner') throw CannotCreateOwnerUserError

        // find roleId by role name
        const roleId = await findRoleByName(data.role);
        if(!roleId) throw RoleNotFoundError;

        // validate branchIds belong to this restaurant
        const branchIds = data.branchIds || [];
        await validateBranchOwnership(branchIds, restaurantId);

        const trx = await db.transaction();

        try {
            // create user, member, assign branches

            const now = new Date();
            const user = await this.userService.create({
                email: data.email,
                name: data.name,
                phone: data.phoneNumber,
                password: '',
                systemRole: SystemRole.RESTAURANT_USER,
            }, trx)

            const member = await createRestaurantMember({
                userId: user.id,
                restaurantId,
                roleId,
                createdAt: now,
                updatedAt: now,
                status: MemberStatus.INACTIVE
            }, trx)

            // check that those branches belong to that restaurant
            const rows = data.branchIds.map((branchId) => new MemberBranch({
                memberId: member.id,
                branchId,
                createdAt: now
            }));
            
            await setMemberBranches(member.id, rows, trx);

            // generate otp, create password reset record and send email
            // generate an otp
            const otp = generateOTP();
            // hash the otp
            const hashedOtp = hashOTP(otp);
            // insert the otp
            await createPasswordReset({
                userId: user.id,
                otpHash: hashedOtp,
                expiresAt: new Date( Date.now() + toMs(1, 'h') ), 
                createdAt: new Date()
            }, trx)

            // TODO: send email
            console.log(`mocked email sent ${otp}`)

            await trx.commit();
            
            return {
                message: "Member invited successfully",
                member: {
                    id: member.id,
                    userId: user.id,
                    email: data.email,
                    name: data.name,
                    phone: data.phoneNumber,
                    role: data.role,
                    status: MemberStatus.INACTIVE,
                    branchIds,
                }
            }

        } catch (err) {
            await trx.rollback();
            throw err;
        }

    }

    listMembers = async (restaurantId: number) => {
        const members = await findMemfbersByRestaurantId(restaurantId);
        return { data: members };
    }

    updateMember = async (restaurantId: number, memberId: number, data: UpdateMemberDTO) => {
        const result = await findMemberWithRoleName(memberId);
        if (!result || Number(result.member.restaurantId) !== Number(restaurantId)) {
            throw MemberNotFoundError;
        }

        const updateData: {roleId?: number, status?: string} = {};
        if(data.role) {
            const roleId = await findRoleByName(data.role);
            if(!roleId) throw RoleNotFoundError;
            updateData.roleId = roleId;
        }
        if(data.status) {
            updateData.status = data.status;
        }

        await updateMember(memberId, updateData);
        return {message: "Member updated successfully"};
    }

    deleteMember = async (restaurantId: number, memberId: number) => {
        const result = await findMemberWithRoleName(memberId);
        if (!result || Number(result.member.restaurantId) !== Number(restaurantId)) {
            throw MemberNotFoundError;
        }
        if(result.roleName === "owner") throw CannotDeleteOwnerError;

        await deleteMember(memberId);
        return {message: "Member deleted successfully"};
    }
     
    updateMemberBranches = async (restaurantId: number, memberId: number, data: UpdateMemberBranchesDTO) => {
        const result = await findMemberWithRoleName(memberId);
        if (!result || Number(result.member.restaurantId) !== Number(restaurantId)) {
            throw MemberNotFoundError;
        }
        if(result.roleName === "owner") throw CannotUpdateOwnerBranchesError;

         // validate branchIds belong to this restaurant (single COUNT query)
        await validateBranchOwnership(data.branchIds, restaurantId);

        const now = new Date();
        const rows = data.branchIds.map( branchId => new MemberBranch({
            memberId,
            branchId,
            createdAt: now
        }));
        await setMemberBranches(memberId, rows);

        return {
            message: "Member branch assignments updated successfully",
            branchIds: data.branchIds,
        };
    }

    getRolePermissions = async (roleName: string) => {
        const permissions = await getPermissionDetailsByRoleName(roleName);
        return {
            role: roleName,
            permissions
        }
    }

}

export const memberService = new MemberService(userService);