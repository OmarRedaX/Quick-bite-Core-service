import { validateBody } from "../../../common/validation/validate";
import { RegisterDTO } from "../dto/auth.dto";
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
            res.status(201).json(result);

        } catch(err) {
            next(err);
        }
    }
}

export const authController = new AuthController(authService);