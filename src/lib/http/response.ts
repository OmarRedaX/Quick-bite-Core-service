import { Response } from "express";

export interface ApiResponse <T = unknown> {
    success: boolean;
    data?: T;
    meta?: Record<string, unknown>;
}

export interface PaginationMeta {
    nextCursor: number;
    hasMore: boolean;
    count: number;
}

export function sendSuccess<T> (res: Response, data?: T, statusCode = 200, meta?: Record<string, unknown>) {
    const body: ApiResponse<T> = {
        success: true,
        data
    };
    if(meta) body.meta = meta;

    res.status(statusCode).json(body);
}

export function sendPaginated<T> (res: Response, data: T[], meta: PaginationMeta) {
    res.status(200).json({success: true, data: data, meta});
}