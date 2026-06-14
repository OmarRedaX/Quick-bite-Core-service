import { db } from "../../../common/knex/knex"
import { User } from "../entity/user.entity";

const USER_COLUMNS = [
    "id",
    "email",
    "phone",
    "name",
    "password_hash",
    "system_role",
    "created_at",
    "updated_at",
    "deleted_at"
]

function toENtity (row: any) {
    return new User({
        id: row.id,
        email: row.email,
        phone: row.phone,
        name: row.name,
        passwordHash: row.password_hash,
        systemRole: row.system_role,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at
    })
}

export async function findUserByEmail (email: string): Promise<User | undefined> {
    const row = await db("users").select(
        USER_COLUMNS
    ).where("email", email).whereNull("deleted_at").first();

    return row ? toENtity(row) : undefined;
}

export async function createUser( user: Partial<User>): Promise <User> {
    const [row] = await db("users").insert({
        email: user.email,
        phone: user.phone,
        name: user.name,
        password_hash: user.passwordHash,
        system_role: user.systemRole,
        created_at: user.createdAt,
        updated_at: user.updatedAt
    }).returning(USER_COLUMNS);

    return toENtity(row);
}