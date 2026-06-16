import { AppError } from "../../common/error/AppError";

export const UserNotFoundError = new AppError("User not found", 404);