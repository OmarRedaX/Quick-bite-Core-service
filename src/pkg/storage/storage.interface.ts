export interface StoredObject {
    key: string;
    /** Size of the stored object in bytes. */
    size: number;
    contentType?: string;
}

export interface IStorageProvider {
    /**
     * Presigned URL the client PUTs the bytes to directly, so file data never
     * passes through this API. The signature covers `contentType`, so an upload
     * whose Content-Type header differs from the one signed here is rejected by
     * the storage backend.
     */
    getUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;

    /** Public (or CDN) URL the object is served from once uploaded. */
    getPublicUrl(key: string): string;

    /** Object metadata, or null when nothing has been uploaded under `key` yet. */
    statObject(key: string): Promise<StoredObject | null>;

    deleteObject(key: string): Promise<void>;
}
