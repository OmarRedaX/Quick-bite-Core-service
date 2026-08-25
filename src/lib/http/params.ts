import {AppError} from "../error/AppError";

/**
 * Parses a route/query param expected to be a positive integer id.
 * `Number(req.params.id)` on non-numeric input yields NaN, which then hits
 * the DB driver as a literal "NaN" and blows up as an unhandled 500 instead
 * of a clean 400 — this guards that boundary.
 */
export function parseIdParam(value: unknown, name: string = "id"): number {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        throw new AppError(`Invalid ${name}`, 400);
    }
    return id;
}
