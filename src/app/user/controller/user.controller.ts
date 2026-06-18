import { NextFunction, Request, Response } from "express";
import { UserService, userService } from "../service/user.service";
import { UpdateUserDTO } from "../dto/user.dto";
import { validateBody } from "../../../common/validation/validate";


export class UserController {
    constructor(private readonly userService: UserService){}

    getMe = async (req: Request, res: Response, next: NextFunction) => {
        try {

            const user = await this.userService.getByUserId(req.user?.userId!);
            return res.status(200).json(user);

        } catch (err) {
            next(err)
        }
    }
   
    updateUser = async (req: Request, res: Response, next: NextFunction) => {
        try {
            //vaildate the body
            const data = await validateBody(UpdateUserDTO, req.body);

            const result = await this.userService.updateUser(req.user?.userId!, data);
            return res.status(200).json(result);

        } catch (err) {
            next(err)
        }
    }

}

export const userController = new UserController(userService);