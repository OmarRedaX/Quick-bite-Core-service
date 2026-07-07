import { NextFunction, Request, Response } from "express";
import { validateBody } from "../../../lib/validation/validate";
import { RegisterDTO, LoginDTO, ForgetPasswordDTO, ResetPasswordDTO, } from "../dto/auth.dto";
import { AuthService } from "../service/auth.service";
import { setAuthCookies } from "../../../lib/utils/cookie.utils";
import { env } from "../../../lib/config/env";
import { toMs } from "../../../pkg/utils/time.utils";
import { TOKENS } from "../../../lib/di/tokens";
import { inject, injectable } from "tsyringe";
import { sendSuccess } from "../../../lib/http/response";

@injectable()
export class AuthController {
  constructor( @inject(TOKENS.AuthService) private readonly authService: AuthService) {}

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. validate req.body
      const data = await validateBody(RegisterDTO, req.body);

      // 2. call service
      const result = await this.authService.register(data);

      // 3. respond
      setAuthCookies(res, result.accessToken, result.refreshToken);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. validate req.body
      const data = await validateBody(LoginDTO, req.body);

      // 2. call service
      const result = await this.authService.login(data);

      setAuthCookies(res, result.accessToken, result.refreshToken);

      // 3. respond
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  forgetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. validate req.body
      const data = await validateBody(ForgetPasswordDTO, req.body);

      // 2. call service
      await this.authService.forgetPassword(data);

      // 3. respond
      sendSuccess(res, { message: "Password reset OTP sent to your email" });
    } catch (err) {
      next(err);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. validate req.body
      const data = await validateBody(ResetPasswordDTO, req.body);

      // 2. call service
      await this.authService.resetPassword(data);

      // 3. respond
      sendSuccess(res, {message: "Password reset successfully, please login again"});
    } catch (err) {
      next(err);
    }
  };

  refreshToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.authService.refresh(req.cookies.refresh_token);
      res.cookie("access_token", result.accessToken, {
        httpOnly: true,
        secure: env.isProduction,
        maxAge: toMs(1, "h"),
      });
      sendSuccess(res, {message: "success"});
    } catch (err) {
      next(err);
    }
  };

  acceptInvite = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. validate req.body
      const data = await validateBody(ResetPasswordDTO, req.body);

      // 2. call service
      await this.authService.acceptInvite(data);

      // 3. respond
      sendSuccess(res, {message: "Invitation accepted successfully, please login again"});
    } catch (err) {
      next(err);
    }
  };
}