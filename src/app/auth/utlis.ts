import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../../common/config/env";


export async function hashPassword (password: string): Promise<string> {
    return bcrypt.hash(password, 10);
}

export interface JwtPayLoad {
    userId: number;
    email: string;
    role: string;
}

export function createAccessToken (payload: JwtPayLoad) : string {
    const options: SignOptions = {expiresIn: Number(env.jwt.accessExpiresIn)}
    return jwt.sign(payload, env.jwt.accessSecret, options);
}

export function createRefreshToken (payload: JwtPayLoad) : string {
    const options: SignOptions = {expiresIn: Number(env.jwt.refreshExpiresIn)}
    return jwt.sign(payload, env.jwt.refreshSecret, options);
}