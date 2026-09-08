import {MediaStatus} from "../enums";

export class Media {
    id: number;
    /**
     * The restaurant that OWNS this file — the one whose product or logo it is
     * for, not whoever performed the upload. Null only when there is no owner
     * yet: a system admin uploading a logo before `POST /restaurants` creates
     * the restaurant row.
     */
    restaurantId: number | null;
    /** The user who performed the upload. Ownership is `restaurantId`, not this. */
    uploadedBy: number;
    /** Object key inside the bucket — the storage-side identity of the file. */
    storageKey: string;
    /** Public URL the object is served from once uploaded. */
    url: string;
    contentType: string;
    sizeBytes: number | null;
    status: MediaStatus;
    createdAt: Date;
    updatedAt: Date;

    constructor(data: Partial<Media>) {
        this.id = data.id!;
        this.restaurantId = data.restaurantId ?? null;
        this.uploadedBy = data.uploadedBy!;
        this.storageKey = data.storageKey!;
        this.url = data.url!;
        this.contentType = data.contentType!;
        this.sizeBytes = data.sizeBytes ?? null;
        this.status = data.status ?? MediaStatus.PENDING;
        this.createdAt = data.createdAt ?? new Date();
        this.updatedAt = data.updatedAt ?? new Date();
    }
}
