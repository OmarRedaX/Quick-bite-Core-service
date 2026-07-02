import { Knex } from "knex";
import { Permission } from "../entity/permission.entity";
import { db } from "../../../common/knex/knex";


function toEntity (row: any) {
    return new Permission({
        id: row.id,
        resource: row.resource,
        action: row.action,
        createdAt: row.createdAt,
    })
}

export async function getPermissionByRoleName (roleName: string, trx?: Knex.Transaction): Promise<string[]> {
    const query = trx || db;
    const rows = await query("permissions as p")
        .select("p.id", "p.resource", "p.action", "p.created_at")
        .join("role_permissions as rp", "p.id", "rp.permission_id")
        .join("roles as r", "rp.role_id", "r.id")
        .where("r.name", roleName);        

    return rows.map((row: any) => {
        const entity = toEntity(row);
        return `${entity.resource}:${entity.action}`;
    });
}

export async function getPermissionDetailsByRoleName (roleName: string): Promise<{permission: string}[]> {
    const rows = await db("permissions as p")
        .select("p.resource", "p.action")
        .join("role_permissions as rp", "p.id", "rp.permission_id")
        .join("roles as r", "rp.role_id", "r.id")
        .where("r.name", roleName);

    return rows.map(row => ({
        permission: `${row.resource}:${row.action}`,
    }));
}