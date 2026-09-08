import {Type} from "class-transformer";
import {IsString, IsNotEmpty, IsOptional, IsInt, Min} from "class-validator";

export class CreateUploadDTO {
    /**
     * MIME type of the file about to be uploaded. It is signed into the
     * presigned URL, so the client must send the same value as the
     * Content-Type header on its PUT.
     */
    @IsString()
    @IsNotEmpty()
    contentType!: string;

    /** Original file name — only its extension/slug is used when building the object key. */
    @IsOptional()
    @IsString()
    fileName?: string;

    /**
     * The restaurant this file is FOR — it becomes the media row's owner,
     * independent of who is uploading. System admins may name any restaurant
     * (or omit it, for a logo uploaded before the restaurant exists);
     * restaurant users may only name their own, and omitting it means theirs.
     */
    @IsOptional()
    // Ids come back from this API as strings (pg BIGINT), so a client echoing
    // one straight back must not be rejected as a non-integer.
    @Type(() => Number)
    @IsInt()
    @Min(1)
    restaurantId?: number;
}
