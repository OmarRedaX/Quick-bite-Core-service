import {NextFunction, Request, Response} from "express";
import {verifyAccessToken} from "../../app/auth/utils";
import {NotAuthenticated} from "./errors";

/**
 * Cookie first (browser clients), falling back to `Authorization: Bearer
 * <token>` for callers that can't set cookies — service-to-service calls,
 * mobile clients, Postman/curl. Same precedence order-service and
 * analytics-service already use.
 */
function extractToken(req: Request): string | undefined {
    if (req.cookies?.access_token) return req.cookies.access_token;
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();
    return undefined;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
    const token = extractToken(req);
    if (!token) {
        throw NotAuthenticated
    }

    try {
        req.user = verifyAccessToken(token);
    } catch {
        // jsonwebtoken throws its own JsonWebTokenError/TokenExpiredError for a
        // malformed, tampered, or expired token — not an AppError, so it would
        // otherwise fall through errorHandler's non-operational branch as a 500.
        throw NotAuthenticated;
    }
    next();
}