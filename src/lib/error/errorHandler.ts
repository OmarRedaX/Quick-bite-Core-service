import type {Request, Response, NextFunction} from "express";
import {logger} from "../logger/logger";
import type {AppError} from "./AppError";

// body-parser (express.json()) throws a plain SyntaxError with a 4xx
// `status`/`statusCode` for malformed request bodies -- not an AppError, so
// without this it would fall through to the generic 500 below.
function asClientError(err: unknown): {statusCode: number; message: string} | null {
    const e = err as {status?: unknown; statusCode?: unknown};
    const status = typeof e.status === "number" ? e.status : (typeof e.statusCode === "number" ? e.statusCode : null);
    if (status !== null && status >= 400 && status < 500) {
        return {statusCode: status, message: "Invalid request body"};
    }
    return null;
}

export function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction) {
    const operational = err.isOperational;

    logger.error(err.message, {
        statusCode: err.statusCode,
        stack: err.stack,
        operational: operational,
        body: req.body,
        correlationId: req.correlationId
    })

    if(operational){
        return res.status(err.statusCode).json({
            error: err.message,
        })
    }

    const clientError = asClientError(err);
    if (clientError) {
        return res.status(clientError.statusCode).json({
            error: clientError.message,
        })
    }

    return res.status(500).json({
        error: 'Something went wrong',
    })
}
