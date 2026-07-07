import { NextFunction, Request, Response } from "express";
import { UserService } from "../service/user.service";
import { UpdateUserDTO } from "../dto/user.dto";
import { validateBody } from "../../../lib/validation/validate";
import { TOKENS } from "../../../lib/di/tokens";
import { inject, injectable } from "tsyringe";
import { sendSuccess } from "../../../lib/http/response";

@injectable()
export class UserController {
  constructor(
    @inject(TOKENS.UserService) private readonly userService: UserService,
  ) {}

  getMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.userService.getByUserId(req.user?.userId!);
      return sendSuccess(res, user);
    } catch (err) {
      next(err);
    }
  };

  updateMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      //vaildate the body
      const data = await validateBody(UpdateUserDTO, req.body);

      const user = await this.userService.updateProfile(
        req.user?.userId!,
        data,
      );
      sendSuccess(res, { message: "Profile updated", user });
    } catch (err) {
      next(err);
    }
  };
}
