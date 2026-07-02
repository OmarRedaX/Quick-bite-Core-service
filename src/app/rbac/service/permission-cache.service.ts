import { toMs } from "../../../common/utils/time.utils";
import { getPermissionByRoleName } from "../repo/permission.repo";


class PermissionCacheService {
    private cache: Map<string, {permission: string[], cachedAt: number}> = new Map();
    private readonly TTL = toMs(1,'h');

    async getPermission (roleName: string): Promise<string[]> {
        // check cache, if it is in the cache, return it, if not fetch from db
        const cached = this.cache.get(roleName);
        if (cached && Date.now() - cached.cachedAt < this.TTL) {
            return cached.permission;
        }
        // after calling db, to insert it into the cache
        const permission = await getPermissionByRoleName(roleName);
        this.cache.set(roleName, { permission, cachedAt: Date.now() });
        return permission;
    }

    hasPermission(permission: string[], resource: string, action: string): boolean {
        return permission.includes(`${resource}:${action}`);
    }
}

export const permissionCacheService = new PermissionCacheService();