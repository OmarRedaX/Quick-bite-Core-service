export enum MediaStatus {
    /** Row created, presigned URL handed out, bytes not confirmed yet. */
    PENDING = 'pending',
    /** Object confirmed present in the bucket — safe to reference from a product/logo. */
    READY = 'ready',
    /** Finalization rejected the object (e.g. over the size cap); bytes removed. */
    FAILED = 'failed',
    /** Object removed from the bucket; the row is kept so existing references resolve. */
    DELETED = 'deleted',
}

/** Image types a client may request a presigned upload URL for. */
export const ALLOWED_MEDIA_TYPES: ReadonlyMap<string, string> = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
    ['image/avif', 'avif'],
]);
