import { AppError } from "../../common/error/AppError";

export const UserNotFound = new AppError("User not found", 404);