import { NextFunction, Request, Response } from "express";
import { NotAuthenticated } from "./errors";
import { SystemRole } from "../../app/user/enums";
import { permissionCacheService } from "../../app/rbac/service/permission-cache.service";

export interface RBACOptions {
    resource: string;
    action: string;
    allowSystemAdmin?: boolean; // by default will be true
}

// check for permission
// system admin bypass this
// restaurant users must have permission for their role

export function rbac(options: RBACOptions) {
    return async(req: Request, res: Response, next: NextFunction) => {
        try{

             // req.user is there , if not we will bail 
            if (!req.user) {
                throw NotAuthenticated
            }

            const { resource, action, allowSystemAdmin = true } = options;

            // if he is a system admin -> bypass 
            if (allowSystemAdmin && req.user.role == SystemRole.SYSTEM_ADMIN) {
                return next();
            }

            // if restaurant user
            if(req.user.role == SystemRole.RESTAURANT_USER){
                // 1. fetch permission 
                const permission = await permissionCacheService.getPermission(req.user.restaurantRole!);
                // 2. check if the permissions has the action for this resource
                if(!permissionCacheService.hasPermission(permission, resource, action)){
                    return res.status(403).json({ error: "Permission denied" });
                }
                // pass 
                return next();
            }

            // if restaurant user -> throw error
            return res.status(403).json({ error: "Permission denied" });

        } catch(err){
            next(err);
        }
        
    }
}

export function requireRestaurantMember(paramName: string= 'restaurantId') {
    return async(req: Request, res: Response, next: NextFunction) => {
        const restaurantId = parseInt(req.params[paramName] as string); // req.params.restaurantId
        if (!restaurantId) {
            return res.status(500).json({"message": "something went wrong"});
        }

        if(req.user?.role == SystemRole.SYSTEM_ADMIN) {
            return next();
        }

        if(Number(req.user?.restaurantId) !== Number(restaurantId)) {
            return res.status(403).json({ error: "Permission denied" })
        }
        next();
    }
}

export function requireBranchAccess(paramName: string= 'branchId') {
    return async(req: Request, res: Response, next: NextFunction) => {
        // system admins bypass
        if (req.user?.role === SystemRole.SYSTEM_ADMIN) {
            return next();
        }
        // owners have access to all branches
        if (req.user?.restaurantRole === "owner") {
            return next();
        }
        // extract branchId from params or query string 
        const branchId = parseInt(req.params[paramName] as string) || parseInt(req.query[paramName] as string);
        if (!branchId) {
            // no branch specified, let it pass (some endpoints don't need branch check)
            return next();
        }

        // check if the branch is in the user's branchId (set during login from member_branches table)
        const userBranchIds = req.user?.branchIds || [];
        if (!userBranchIds.includes(branchId)) {
            return res.status(403).json({ error: "You do not have access to this branch" });
        }

        next();
    }
} 