import {Request, Response, NextFunction} from "express";
import {TOKENS} from "../di/tokens";
import {container} from "../di/container";
import {PermissionCacheService} from "../../app/rbac/service/permission-cache.service";
import {RestaurantNotFoundError} from "../../app/restaurant/errors";
import {findRestaurantById} from "../../app/restaurant/repository/restaurant.repo";
import {SystemRole} from "../../app/user/enums";
import {NotAuthenticated, UnAuthorisedError} from "./errors";

export interface RBACOptions {
    resource: string;
    action: string;
    allowSystemAdmin?: boolean; // by default will be true
}
// check for permissions
// system admin bypass this
// restaurant users must have permissions for their role

// router.post('/products', authenticate, rbac({resource:"product",action:"create"}), productController.create)

export function rbac(options: RBACOptions) {
    return async(req: Request, res: Response, next: NextFunction) => {
        // req.user is there , if not we will bail
        try {
            if (!req.user) {
                throw NotAuthenticated
            }
            const {resource, action, allowSystemAdmin = true} = options;

            // if he is a system admin -> bypass
            if (allowSystemAdmin && req.user.role == SystemRole.SYSTEM_ADMIN) {
                return next();
            }
            // if restaurant user
            // 1. fetch permissions
            // 2. check if the permissions has the action for this resource
            if (req.user.role == SystemRole.RESTAURANT_USER) {
                const permissionCacheService = container.resolve<PermissionCacheService>(TOKENS.PermissionCacheService);
                const permissions = await permissionCacheService.getPermissions(req.user.restaurantRole!);
                if (!permissionCacheService.hasPermission(permissions, resource, action)) {
                    return res.status(403).json({
                        error: "Permission denied",
                    })
                }
                // pass
                return next();
            }
            // if not restaurant user -> throw err
            return res.status(403).json({
                error: "Permission denied",
            })
        }
        catch (error) {
            next(error);
        }
    }
}

export function requireRestaurantMember(paramName: string= 'restaurantId') {
    return (req: Request, res: Response, next: NextFunction) => {
        const restaurantId = parseInt(req.params[paramName] as string); // req.params.restaurantId
        if (!restaurantId) {
            return res.status(500).json({"message": "something went wrong"});
        }

        if(req.user?.role == SystemRole.SYSTEM_ADMIN) {
            return next();
        }

        if(Number(req.user?.restaurantId) !== Number(restaurantId)) {
            return res.status(403).json({
                error: "Permission denied",
            })
        }
        next();
    }
}

export function requireBranchAccess(paramName: string= 'branchId') {
    return (req: Request, res: Response, next: NextFunction) => {
        // system admins bypass
        if (req.user?.role == SystemRole.SYSTEM_ADMIN) {
            return next();
        }
        // owners have access to all branches
        if (req.user?.restaurantRole == 'owner') {
            return next();
        }

        const branchId = parseInt(req.params[paramName] as string) || parseInt(req.query[paramName] as string);
        if (!branchId) {
            // no branch specified, let it pass (some endpoints don't need branch check)
            return next();
        }

        const userBranchIds = req.user?.branchIds || [];
        if (!userBranchIds.includes(branchId)) {
            return res.status(403).json({
                error: "You do not have access to this branch",
            })
        }
        next();
    }
}

/**
 * Resolves which restaurant OWNS the resource an action targets, for handlers
 * that take the target restaurant in the body rather than the URL (so
 * `requireRestaurantMember`, which reads a route param, cannot scope them).
 *
 * The answer is always the *target* — the restaurant the created row will
 * belong to — never the caller's own identity. Who performed the action is
 * recorded separately by each caller (e.g. `media.uploaded_by`), so an admin
 * acting for a restaurant produces a row owned by that restaurant, not by the
 * admin.
 *
 * - `system_admin` may target any restaurant, or none (`null`) — a restaurant's
 *   logo is uploaded before `POST /restaurants` creates the row it belongs to.
 * - A restaurant user may only target their own restaurant; naming a different
 *   one is a 403 rather than being silently rewritten, and omitting it falls
 *   back to their own, which is the only restaurant they could mean.
 *
 * Throws `UnAuthorisedError` when the caller may not act for the target, and
 * `RestaurantNotFoundError` when the target does not exist.
 */
export async function resolveOwningRestaurantId(
    userRole: SystemRole,
    callerRestaurantId: number | undefined,
    targetRestaurantId: number | undefined,
): Promise<number | null> {
    let owningRestaurantId: number | null;

    if (userRole === SystemRole.SYSTEM_ADMIN) {
        owningRestaurantId = targetRestaurantId === undefined ? null : Number(targetRestaurantId);
    } else {
        if (!callerRestaurantId) throw UnAuthorisedError;
        if (targetRestaurantId !== undefined && Number(targetRestaurantId) !== Number(callerRestaurantId)) {
            throw UnAuthorisedError;
        }
        owningRestaurantId = Number(callerRestaurantId);
    }

    if (owningRestaurantId !== null) {
        const restaurant = await findRestaurantById(owningRestaurantId);
        if (!restaurant) throw RestaurantNotFoundError;
    }
    return owningRestaurantId;
}
