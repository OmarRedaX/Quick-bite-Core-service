import { NextFunction, Request, Response } from "express";
import { BranchService } from "../service/branch.service";
import { validateBody } from "../../../lib/validation/validate";
import {
  CreateBranchDTO,
  UpdateBranchDTO,
  UpdateBranchStatusDTO,
} from "../dto/branch.dto";
import { SystemRole } from "../../user/enums";
import { inject, injectable } from "tsyringe";
import { TOKENS } from "../../../lib/di/tokens";
import { sendSuccess } from "../../../lib/http/response";

@injectable()
export class BranchController {
  constructor(
    @inject(TOKENS.BranchService) private readonly branchService: BranchService,
  ) {}

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await validateBody(CreateBranchDTO, req.body);
      const branch = await this.branchService.create(
        Number(req.params.restaurantId),
        req.user?.userId!,
        req.user?.role! as SystemRole,
        data,
      );
      sendSuccess(res, { message: "Branch added", branch }, 201);
    } catch (err) {
      next(err);
    }
  };

  findNearby = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const results = await this.branchService.findNearby(
        Number(req.query.lat),
        Number(req.query.lng),
      );
      sendSuccess(res, { data: results });
    } catch (err) {
      next(err);
    }
  };

  findByRestaurant = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const results = await this.branchService.findByRestaurant(
        Number(req.params.restaurantId),
      );
      sendSuccess(res, { data: results });
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await validateBody(UpdateBranchDTO, req.body);
      const updatedBranch = await this.branchService.update(
        Number(req.params.branchId),
        req.user?.userId!,
        req.user?.role! as SystemRole,
        data,
      );
      sendSuccess(res, { message: "Branch updated", updatedBranch });
    } catch (err) {
      next(err);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await validateBody(UpdateBranchStatusDTO, req.body);
      const branch = await this.branchService.updateStatus(
        Number(req.params.branchId),
        req.user?.role! as SystemRole,
        data,
      );
      sendSuccess(res, {
        message: "Branch status updated",
        branch: {
          id: branch.id,
          isActive: branch.isActive,
          acceptOrders: branch.acceptOrders,
          commission: branch.commission,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}
