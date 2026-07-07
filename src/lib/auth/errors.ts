import { AppError } from "../error/AppError";


export const NotAuthenticated = new AppError("User not authenticated", 403);
export const UnauthorizedError = new AppError("User not authorized", 403);
