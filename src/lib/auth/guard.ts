import {NextFunction, Request, Response} from "express";
import {verifyAccessToken} from "../../app/auth/utils";
import {NotAuthenticated} from "./errors";

export function authenticate(req: Request, res: Response, next: NextFunction) {
    const token = req.cookies.access_token;
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