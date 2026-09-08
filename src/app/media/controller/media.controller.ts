import {Request, Response, NextFunction} from "express";
import {injectable, inject} from "tsyringe";
import {TOKENS} from "../../../lib/di/tokens";
import {parseIdParam} from "../../../lib/http/params";
import {sendSuccess} from "../../../lib/http/response";
import {validateBody} from "../../../lib/validation/validate";
import {SystemRole} from "../../user/enums";
import {CreateUploadDTO} from "../dto/media.dto";
import {MediaService} from "../service/media.service";

@injectable()
export class MediaController {
    constructor(@inject(TOKENS.MediaService) private readonly mediaService: MediaService) {}

    createUpload = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = await validateBody(CreateUploadDTO, req.body);
            const ticket = await this.mediaService.createUpload(
                req.user?.userId!,
                req.user?.role! as SystemRole,
                req.user?.restaurantId,
                data,
            );
            sendSuccess(res, {
                message: "Upload URL created",
                media: ticket.media,
                uploadUrl: ticket.uploadUrl,
                expiresIn: ticket.expiresIn,
            }, 201);
        } catch (err) {
            next(err);
        }
    }

    complete = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const media = await this.mediaService.complete(
                parseIdParam(req.params.id),
                req.user?.role! as SystemRole,
                req.user?.restaurantId,
            );
            sendSuccess(res, {message: "Upload completed", media});
        } catch (err) {
            next(err);
        }
    }

    findById = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const media = await this.mediaService.findById(
                parseIdParam(req.params.id),
                req.user?.role! as SystemRole,
                req.user?.restaurantId,
            );
            sendSuccess(res, media);
        } catch (err) {
            next(err);
        }
    }

    remove = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const media = await this.mediaService.remove(
                parseIdParam(req.params.id),
                req.user?.role! as SystemRole,
                req.user?.restaurantId,
            );
            sendSuccess(res, {message: "Media deleted", media});
        } catch (err) {
            next(err);
        }
    }
}
