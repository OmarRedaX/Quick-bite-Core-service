import { AppError } from "../../common/error/AppError";

export const UserAlreadyExistsError = new AppError("User already exists with same phone or email", 400);
export const CannotSignupAsSystemAdmin = new AppError("You Cannot register as a system admin", 403);