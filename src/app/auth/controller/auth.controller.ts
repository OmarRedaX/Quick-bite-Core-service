import {NextFunction, Request, Response} from "express";
import {validateBody} from "../../../common/validation/validate";
import {RegisterDTO, LoginDTO, ForgetPasswordDTO, ResetPasswordDTO} from "../dto/auth.dto";
import {AuthService, authService} from "../service/auth.service";
import {setAuthCookies} from "../../../common/utils/cookie.utils";
import {env} from "../../../common/config/env";
import {toMs} from "../../../common/utils/time.utils";

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
            setAuthCookies(res, result.accessToken, result.refreshToken);
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

            setAuthCookies(res, result.accessToken, result.refreshToken);

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

            const result = await this.authService.refresh(req.cookies.refresh_token);
            res.cookie("access_token", result.accessToken, {
                httpOnly: true,
                secure: env.isProduction,
                maxAge: toMs(1, 'h'),
            });
            res.status(200).json({message: "success"});

        } catch (err) {
            next(err)
        }
    }
}

export const authController = new AuthController(authService);