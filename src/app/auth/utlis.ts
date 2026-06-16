import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../../common/config/env";
import crypto from "crypto";

export async function hashPassword (password: string): Promise<string> {
    return bcrypt.hash(password, 10);
}

export interface JwtPayLoad {
    userId: number;
    email: string;
    role: string;
}

// ----- token creation
export function createAccessToken (payload: JwtPayLoad) : string {
    const options: SignOptions = {expiresIn: Number(env.jwt.accessExpiresIn)}
    return jwt.sign(payload, env.jwt.accessSecret, options);
}

export function createRefreshToken (payload: JwtPayLoad) : string {
    const options: SignOptions = {expiresIn: Number(env.jwt.refreshExpiresIn)}
    return jwt.sign(payload, env.jwt.refreshSecret, options);
}

// ----- token verification
export function verifyAccessToken(token: string): JwtPayLoad {
    return jwt.verify(token, env.jwt.accessSecret) as JwtPayLoad;
}

export function verifyRefreshToken(token: string): JwtPayLoad {
    return jwt.verify(token, env.jwt.refreshSecret) as JwtPayLoad;
}

export function comparePassword (password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
}

export function generateOTP (): string {
    return crypto.randomInt(100000, 999999).toString();
}

export function hashOTP (otp: string) {
    return crypto.createHash("sha256").update(otp).digest("hex");
}