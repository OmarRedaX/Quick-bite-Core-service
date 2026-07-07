import { NextFunction, Request, Response } from "express";
import { MemberService } from "../service/member.service";
import { validateBody } from "../../../lib/validation/validate";
import {
  CreateMemberDTO,
  UpdateMemberBranchesDTO,
  UpdateMemberDTO,
} from "../dto/member.dto";
import { inject, injectable } from "tsyringe";
import { TOKENS } from "../../../lib/di/tokens";
import { sendSuccess } from "../../../lib/http/response";

@injectable()
export class MemberController {
  constructor(
    @inject(TOKENS.MemberService) private readonly memberService: MemberService,
  ) {}

  createMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await validateBody(CreateMemberDTO, req.body);
      const result = await this.memberService.createMember(
        Number(req.params.restaurantId),
        data,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  listMembers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.memberService.listMembers(
        Number(req.params.restaurantId),
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  updateMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await validateBody(UpdateMemberDTO, req.body);
      const result = await this.memberService.updateMember(
        Number(req.params.restaurantId),
        Number(req.params.memberId),
        data,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  deleteMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.memberService.deleteMember(
        Number(req.params.restaurantId),
        Number(req.params.memberId),
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  updateMemberBranches = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const data = await validateBody(UpdateMemberBranchesDTO, req.body);
      const result = await this.memberService.updateMemberBranches(
        Number(req.params.restaurantId),
        Number(req.params.memberId),
        data,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  getRolePermissions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.memberService.getRolePermissions(
        req.params.role as string,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
