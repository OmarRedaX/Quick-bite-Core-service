import { NextFunction, Request, Response } from "express";
import { RestaurantService, restaurantService } from "../service/restaurant.service";
import { validateBody } from "../../../common/validation/validate";
import { CreateRestaurantDTO, UpdateRestaurantDTO, UpdateRestaurantStatusDTO } from "../dto/restaurant.dto";
import { SystemRole } from "../../user/enums";


export class RestaurantController {

    constructor (private readonly restaurantService: RestaurantService) {}

    create = async(req: Request, res: Response, next: NextFunction) => {
        try{
            const data = await validateBody(CreateRestaurantDTO, req.body);
            const result = await this.restaurantService.createWithOwner(req.user?.role! as SystemRole, data);
            res.status(201).json({message: "Restaurant created", ...result});

        } catch(err){
            next(err);
        }
    }

    getAll = async(req: Request, res: Response, next: NextFunction) => {
        try{
            const result = await this.restaurantService.findAll();
            res.status(200).json({ data: result });
        } catch(err){
            next(err);
        }
    }

    getById = async(req: Request, res: Response, next: NextFunction) => {
        try{
            const result = await this.restaurantService.findById(Number(req.params.id));
            res.status(200).json({ data: result });
        } catch(err){
            next(err);
        }
    }

    update = async (req: Request, res: Response, next: NextFunction) => {
        try{
            const data = await validateBody(UpdateRestaurantDTO, req.body);
            const result = await this.restaurantService.update(Number(req.params.id), req.user?.userId!, req.user?.role! as SystemRole, data);
            res.status(200).json({message: "Restaurant updated", restaurant: result});
        } catch(err){
            next(err);
        }
    }

    updateStatus = async (req: Request, res: Response, next: NextFunction) => {
        try{
            const data = await validateBody(UpdateRestaurantStatusDTO, req.body);
            const result = await this.restaurantService.updateStatus(Number(req.params.id), req.user?.role! as SystemRole, data);
            res.status(200).json({message: "Status updated", restaurant: {id: result.id, status: result.status}});
        } catch(err){
            next(err);
        }
    }

}

export const restaurantController = new RestaurantController(restaurantService);