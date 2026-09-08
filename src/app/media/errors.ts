import {AppError} from "../../lib/error/AppError";
import {ALLOWED_MEDIA_TYPES} from "./enums";

export const MediaNotFoundError = new AppError('Media not found', 404);
export const MediaNotUploadedError = new AppError('No object found for this media — upload the file to the presigned URL first', 409);

export function unsupportedMediaTypeError(contentType: string) {
    return new AppError(
        `Unsupported contentType "${contentType}". Allowed: ${[...ALLOWED_MEDIA_TYPES.keys()].join(', ')}`,
        415,
    );
}

export function mediaTooLargeError(sizeBytes: number, maxBytes: number) {
    return new AppError(`Uploaded file is ${sizeBytes} bytes, which exceeds the ${maxBytes} byte limit`, 413);
}
