import { getCookieOptions } from "../../../common/utils/cookie.utils";
import { validateBody } from "../../../common/validation/validate";
import { ForgetPasswordDTO, LoginDTO, RegisterDTO, ResetPasswordDTO } from "../dto/auth.dto";
import { authService, AuthService } from "../service/auth.service";
import {Request, Response, NextFunction } from "express";

export class AuthController {
    constructor(private readonly authService: AuthService) {
    }

    register = async(req: Request, res: Response, next: NextFunction) => {
        try {
            // 1. validate req.body
            const data = await validateBody(RegisterDTO, req.body);

            // 2. call service
            const result = await this.authService.register(data);

            // 3. respond
            res.cookie("access_token", result.accessToken, getCookieOptions("access"));
            res.cookie("refresh_token", result.refreshToken, getCookieOptions("refresh"));
            res.status(201).json(result);

        } catch(err) {
            next(err);
        }
    }

    login = async(req: Request, res: Response, next: NextFunction) => {
        try {
            // 1. validate req.body
            const data = await validateBody(LoginDTO, req.body);

            // 2. call service
            const result = await this.authService.login(data)

            res.cookie("access_token", result.accessToken, getCookieOptions("access"));
            res.cookie("refresh_token", result.refreshToken, getCookieOptions("refresh"));

            // 3. respond
            res.status(200).json(result);

        } catch(err) {
            next(err);
        }
    }

    forgetPassword = async(req: Request, res: Response, next: NextFunction) => {
        try {
            // 1. validate req.body
            const data = await validateBody(ForgetPasswordDTO, req.body);

            // 2. call service
            await this.authService.forgetPassword(data);

            // 3. respond
            res.status(200).json({ message: "Password reset OTP sent to your email" });

        } catch (err) {
            next(err);
        }
    }

    resetPassword = async(req: Request, res: Response, next: NextFunction) => {
        try {
            // 1. validate req.body
            const data = await validateBody(ResetPasswordDTO, req.body);

            // 2. call service
            await this.authService.resetPassword(data);

            // 3. respond
            res.status(200).json({ message: "Password reset successful, please login again" });

        } catch (err) {
            next(err);
        }
    }
    
    refreshToken = async(req: Request, res: Response, next: NextFunction) => {
         try {

            const result = await this.authService.refreshToken(req.cookies.refresh_token);

            res.cookie("access_token", result.accessToken, getCookieOptions("access"))

            return res.status(200).json({message: "success"});

        } catch (err) {
            next(err)
        }
    }
}

export const authController = new AuthController(authService);