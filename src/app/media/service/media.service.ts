import {randomUUID} from "crypto";
import {inject, injectable} from "tsyringe";
import {UnAuthorisedError} from "../../../lib/auth/errors";
import {resolveOwningRestaurantId} from "../../../lib/auth/rbac";
import {env} from "../../../lib/config/env";
import {TOKENS} from "../../../lib/di/tokens";
import type {IStorageProvider} from "../../../pkg/storage/storage.interface";
import {SystemRole} from "../../user/enums";
import {CreateUploadDTO} from "../dto/media.dto";
import {Media} from "../entity/media.entity";
import {ALLOWED_MEDIA_TYPES, MediaStatus} from "../enums";
import {MediaNotFoundError, MediaNotUploadedError, mediaTooLargeError, unsupportedMediaTypeError} from "../errors";
import {createMedia, findMediaById, updateMediaStatus} from "../repository/media.repository";
import {UploadTicket} from "../types";

@injectable()
export class MediaService {
    constructor(@inject(TOKENS.StorageProvider) private readonly storage: IStorageProvider) {}

    /**
     * Step 1 of the upload: reserve an object key, record it as `pending`, and
     * hand back a presigned URL the client PUTs the bytes to directly. Nothing
     * is trusted about the file until complete() confirms it landed.
     */
    createUpload = async (
        uploaderId: number,
        userRole: SystemRole,
        callerRestaurantId: number | undefined,
        data: CreateUploadDTO,
    ): Promise<UploadTicket> => {
        const contentType = data.contentType.trim().toLowerCase();
        const extension = ALLOWED_MEDIA_TYPES.get(contentType);
        if (!extension) throw unsupportedMediaTypeError(data.contentType);

        // The row is owned by the restaurant the image is FOR; the caller is
        // recorded separately as uploadedBy.
        const restaurantId = await resolveOwningRestaurantId(userRole, callerRestaurantId, data.restaurantId);

        const storageKey = buildStorageKey(restaurantId, extension, data.fileName);
        const media = await createMedia({
            restaurantId,
            uploadedBy: uploaderId,
            storageKey,
            url: this.storage.getPublicUrl(storageKey),
            contentType,
            status: MediaStatus.PENDING,
        });

        const expiresIn = env.storage.uploadUrlTtlSeconds;
        const uploadUrl = await this.storage.getUploadUrl(storageKey, contentType, expiresIn);
        return {media, uploadUrl, expiresIn};
    }

    /**
     * Step 2: confirm the bytes actually reached the bucket and are within the
     * size cap — a presigned PUT can't cap size up front, so it is enforced
     * here, with the offending object removed rather than left billing storage.
     * Idempotent: re-completing an already-ready media is a no-op.
     */
    complete = async (
        mediaId: number,
        userRole: SystemRole,
        callerRestaurantId: number | undefined,
    ): Promise<Media> => {
        const media = await this.findById(mediaId, userRole, callerRestaurantId);
        if (media.status === MediaStatus.READY) return media;

        const object = await this.storage.statObject(media.storageKey);
        if (!object) throw MediaNotUploadedError;

        if (object.size > env.storage.maxUploadBytes) {
            await this.storage.deleteObject(media.storageKey);
            await updateMediaStatus(media.id, MediaStatus.FAILED, object.size);
            throw mediaTooLargeError(object.size, env.storage.maxUploadBytes);
        }

        return updateMediaStatus(media.id, MediaStatus.READY, object.size);
    }

    findById = async (
        mediaId: number,
        userRole: SystemRole,
        callerRestaurantId: number | undefined,
    ): Promise<Media> => {
        const media = await findMediaById(mediaId);
        // A deleted row is kept only so old references still resolve to a 404
        // rather than a dangling link — it is not readable media any more.
        if (!media || media.status === MediaStatus.DELETED) throw MediaNotFoundError;
        assertCanAccess(media, userRole, callerRestaurantId);
        return media;
    }

    /**
     * Removes the object from the bucket and marks the row `deleted`, keeping
     * the row so a product still pointing at the URL is traceable.
     */
    remove = async (
        mediaId: number,
        userRole: SystemRole,
        callerRestaurantId: number | undefined,
    ): Promise<Media> => {
        const media = await this.findById(mediaId, userRole, callerRestaurantId);
        await this.storage.deleteObject(media.storageKey);
        return updateMediaStatus(media.id, MediaStatus.DELETED);
    }
}

function assertCanAccess(media: Media, userRole: SystemRole, callerRestaurantId: number | undefined): void {
    if (userRole === SystemRole.SYSTEM_ADMIN) return;
    // Media with no restaurant belongs to an admin-only flow, so it stays
    // invisible to restaurant users even when they hold core:media:read.
    if (media.restaurantId === null || Number(media.restaurantId) !== Number(callerRestaurantId)) {
        throw UnAuthorisedError;
    }
}

/**
 * Every upload lives under the bucket's `restaurants/` directory:
 * `restaurants/<id>/<yyyy>/<mm>/<uuid>-<slug>.<ext>`, or
 * `restaurants/shared/...` when there is no restaurant yet (an admin uploading
 * a logo before the restaurant row exists). The uuid guarantees uniqueness, so
 * the client-supplied name can never collide with or overwrite another object;
 * it is kept only to make the key readable in the bucket.
 */
function buildStorageKey(restaurantId: number | null, extension: string, fileName?: string): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const scope = restaurantId === null ? "restaurants/shared" : `restaurants/${restaurantId}`;
    const slug = slugifyFileName(fileName);
    return `${scope}/${year}/${month}/${randomUUID()}${slug}.${extension}`;
}

function slugifyFileName(fileName?: string): string {
    if (!fileName) return "";
    const base = fileName.replace(/\.[^.]*$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
    return base ? `-${base}` : "";
}
