import { Knex } from "knex";
import { RegisterRestaurantDTO } from "../../auth/dto/auth.dto";
import { Restaurant } from "../entity/restaurant.entity";
import { RestaurantStatus } from "../enums";
import { createRestaurant, findAllRestaurants, findRestaurantById, updateRestaurant, updateRestaurantStatus, } from "../repository/restaurant.repo";
import { CreateRestaurantDTO, UpdateRestaurantDTO, UpdateRestaurantStatusDTO } from "../dto/restaurant.dto";
import { SystemRole } from "../../user/enums";
import { UnauthorizedError } from "../../../common/auth/errors";
import { createUser, findUserExistsByEmailOrPhone } from "../../user/repository/users.repo";
import { OwnerAlreadyExistsError, RestaurantNotFoundError } from "../error";
import { hashPassword } from "../../auth/utlis";
import { db } from "../../../common/knex/knex";

export class RestaurantService {

  createWithOwner = async (userRole: SystemRole, data: CreateRestaurantDTO) => {
    if (userRole !== SystemRole.SYSTEM_ADMIN) {
      throw UnauthorizedError;
    }

    const existing = await findUserExistsByEmailOrPhone(data.owner.email, data.owner.phone);
    if (existing) {
      throw OwnerAlreadyExistsError;
    }

    const hashedPassword = await hashPassword(data.owner.password);
    const now = new Date();
    const trx = await db.transaction();

    try {

      const user = await createUser({
        email: data.owner.email,
        phone: data.owner.phone,
        name: data.owner.name,
        passwordHash: hashedPassword,
        systemRole: SystemRole.RESTAURANT_USER,
        createdAt: now,
        updatedAt: now,
      }, trx);

      const restaurant = await createRestaurant( new Restaurant({
        ownerId: user.id,
        name: data.name,
        logoURL: data.logoURL ?? "",
        primaryCountry: data.primaryCountry,
        status: RestaurantStatus.ACTIVE,
        createdAt: now,
        updatedAt: now,
        statusUpdatedAt: now,
      }), trx)

      await trx.commit();

      return {
        restaurant,
        owner: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          name: user.name,
          systemRole: user.systemRole,
        },
      };

    } catch (err){
      await trx.rollback();
      throw err;
    }

  }

  create = async (userId: number, data: RegisterRestaurantDTO, trx: Knex) => {
    const now = new Date();
    const restaurant = await createRestaurant(
      new Restaurant({
        ownerId: userId,
        name: data.name,
        logoURL: data.logoURL,
        status: RestaurantStatus.PENDING,
        primaryCountry: data.primaryCountry,
        createdAt: now,
        updatedAt: now,
        statusUpdatedAt: now,
      }),
      trx,
    );

    return restaurant;
  };

  findAll = async () => {
    const result = await findAllRestaurants();
    return result;
  };

  findById = async(id: number) => {
    const result = await findRestaurantById(id);
    if(!result) {
      throw RestaurantNotFoundError;
    }
    return result;
  }

  update = async(id: number, userId: number, userRole: SystemRole, data: UpdateRestaurantDTO) => {
    const restaurant = await findRestaurantById(id);
    if (!restaurant) {
      throw RestaurantNotFoundError;
    }
    if(userRole !== SystemRole.SYSTEM_ADMIN && Number(restaurant.ownerId) !== Number(userId)) {
      throw UnauthorizedError;
    }
    return await updateRestaurant(id, data);
  }

  updateStatus = async (id: number, userRole: SystemRole, data: UpdateRestaurantStatusDTO) => {
    if(userRole !== SystemRole.SYSTEM_ADMIN) {
      throw UnauthorizedError;
    }
    const restaurant = await findRestaurantById(id);
    if (!restaurant) {
      throw RestaurantNotFoundError;
    }
    return await updateRestaurantStatus(id, data.status);
  }
}

export const restaurantService = new RestaurantService();
