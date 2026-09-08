import type {IStorageProvider, StoredObject} from "../../src/pkg/storage/storage.interface";

export const STUB_PUBLIC_BASE_URL = "https://media.test.local";

/**
 * In-memory stand-in for S3 — the only true external in the media flow. It
 * records what was signed/deleted and lets a test simulate the client-side PUT
 * that would otherwise happen straight against the bucket.
 */
export class StorageStub implements IStorageProvider {
    /** Objects that "exist" in the bucket, keyed by object key. */
    objects = new Map<string, StoredObject>();
    /** Every (key, contentType) an upload URL was signed for, in order. */
    signed: Array<{key: string, contentType: string, expiresInSeconds?: number}> = [];
    /** Keys deleteObject() was called with, in order. */
    deleted: string[] = [];

    async getUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string> {
        this.signed.push({key, contentType, expiresInSeconds});
        return `${STUB_PUBLIC_BASE_URL}/${key}?X-Amz-Signature=stub&X-Amz-Expires=${expiresInSeconds ?? 900}`;
    }

    getPublicUrl(key: string): string {
        return `${STUB_PUBLIC_BASE_URL}/${key}`;
    }

    async statObject(key: string): Promise<StoredObject | null> {
        return this.objects.get(key) ?? null;
    }

    async deleteObject(key: string): Promise<void> {
        this.deleted.push(key);
        this.objects.delete(key);
    }

    /** Simulates the client PUTting bytes to the presigned URL. */
    putObject(key: string, size: number, contentType = "image/png"): void {
        this.objects.set(key, {key, size, contentType});
    }

    reset(): void {
        this.objects.clear();
        this.signed = [];
        this.deleted = [];
    }
}

export const storagestub = new StorageStub();
