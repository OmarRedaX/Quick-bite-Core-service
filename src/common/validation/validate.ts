import { validate } from "class-validator"
import { AppError } from "../error/AppError";

export async function validateBody <T extends Object>(cls: new () => T, body: unknown) : Promise<T> {
    const instance = Object.assign(new cls(), body)
    const errors = await validate(instance, {whitelist: true})

    if (errors.length > 0) {
        const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
        throw new AppError(messages.join(", "), 400)
    }
    return instance
}