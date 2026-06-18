import { CookieOptions } from "express";
import { toMilliseconds } from "./time.utils";
import { env } from "../config/env";

export const getCookieOptions = (type: "access" | "refresh"): CookieOptions => {

    const baseOptions: CookieOptions = {
        httpOnly: true,
        secure: env.nodeEnv === "production"
    };

    if (type === 'access') {
        return {
            ...baseOptions,
             maxAge: toMilliseconds({ hours: 1 }),
        };
    }

    // Refresh Token
    return {
        ...baseOptions,
        maxAge: toMilliseconds({ days: 7 }),
        path: '/api/auth/refresh-token',
    };
}