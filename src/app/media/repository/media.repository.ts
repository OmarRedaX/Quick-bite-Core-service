import {db} from "../../../lib/knex/knex";
import {Media} from "../entity/media.entity";
import {MediaStatus} from "../enums";

const MEDIA_COLUMNS = ['id', 'restaurant_id', 'uploaded_by', 'storage_key', 'url', 'content_type', 'size_bytes', 'status', 'created_at', 'updated_at'];

function toEntity(row: any): Media {
    return new Media({
        id: row.id,
        restaurantId: row.restaurant_id,
        uploadedBy: row.uploaded_by,
        storageKey: row.storage_key,
        url: row.url,
        contentType: row.content_type,
        // pg hands BIGINT back as a string; a byte count reads better as a
        // number, and it is bounded by MEDIA_MAX_UPLOAD_BYTES anyway. Ids are
        // deliberately left as pg returns them, matching every other module.
        sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    });
}

export async function createMedia(data: Partial<Media>): Promise<Media> {
    const [row] = await db("media").insert({
        restaurant_id: data.restaurantId ?? null,
        uploaded_by: data.uploadedBy,
        storage_key: data.storageKey,
        url: data.url,
        content_type: data.contentType,
        size_bytes: data.sizeBytes ?? null,
        status: data.status ?? MediaStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
    }).returning(MEDIA_COLUMNS);
    return toEntity(row);
}

export async function findMediaById(id: number): Promise<Media | undefined> {
    const row = await db("media").select(MEDIA_COLUMNS).where("id", id).first();
    return row ? toEntity(row) : undefined;
}

export async function updateMediaStatus(id: number, status: MediaStatus, sizeBytes?: number): Promise<Media> {
    const [row] = await db("media").where("id", id).update({
        status,
        // `undefined` is dropped by knex, so an unknown size leaves the column untouched.
        size_bytes: sizeBytes,
        updated_at: new Date(),
    }).returning(MEDIA_COLUMNS);
    return toEntity(row);
}
