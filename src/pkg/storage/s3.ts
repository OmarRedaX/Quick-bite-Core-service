import {S3Client, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import type {IStorageProvider, StoredObject} from "./storage.interface";

export interface S3Config {
    region: string;
    bucket: string;
    /** Blank leaves credentials to the SDK's default chain (IAM role, shared config, env). */
    accessKeyId?: string;
    secretAccessKey?: string;
    /** CDN / custom domain objects are served from; falls back to the bucket's own URL. */
    publicBaseUrl?: string;
    /** Non-AWS S3-compatible endpoint (MinIO, LocalStack); unset for real S3. */
    endpoint?: string;
    forcePathStyle?: boolean;
    uploadUrlTtlSeconds: number;
}

export class S3StorageProvider implements IStorageProvider {
    private readonly client: S3Client;
    private readonly bucket: string;
    private readonly uploadUrlTtlSeconds: number;
    private readonly publicBaseUrl: string;

    constructor(config: S3Config) {
        this.client = new S3Client({
            region: config.region,
            endpoint: config.endpoint || undefined,
            forcePathStyle: config.forcePathStyle ?? false,
            // Since v3.729 the SDK defaults to "WHEN_SUPPORTED", which bakes a
            // CRC32 of an EMPTY body (x-amz-checksum-crc32=AAAAAA==) into every
            // presigned PutObject URL. A browser PUTting real bytes then fails
            // with XAmzContentChecksumMismatch, so presigned uploads require
            // "WHEN_REQUIRED" — the checksum is left to S3's own integrity check.
            requestChecksumCalculation: "WHEN_REQUIRED",
            // Passing credentials: undefined (rather than an object of empty
            // strings) is what lets the SDK fall back to its default provider
            // chain, which is how this runs on EC2/ECS without static keys.
            credentials: config.accessKeyId && config.secretAccessKey
                ? {accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey}
                : undefined,
        });
        this.bucket = config.bucket;
        this.uploadUrlTtlSeconds = config.uploadUrlTtlSeconds;
        this.publicBaseUrl = (config.publicBaseUrl || defaultPublicBaseUrl(config)).replace(/\/+$/, "");
    }

    async getUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string> {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
        });
        return getSignedUrl(this.client, command, {
            expiresIn: expiresInSeconds ?? this.uploadUrlTtlSeconds,
            // The presigner signs only `host` by default, which would let a
            // client upload any content type it liked under a key we recorded
            // as an image. Signing content-type binds the upload to the type
            // the caller declared.
            signableHeaders: new Set(["content-type"]),
        });
    }

    getPublicUrl(key: string): string {
        return `${this.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
    }

    async statObject(key: string): Promise<StoredObject | null> {
        try {
            const head = await this.client.send(new HeadObjectCommand({Bucket: this.bucket, Key: key}));
            return {
                key,
                size: Number(head.ContentLength ?? 0),
                contentType: head.ContentType,
            };
        } catch (err: any) {
            // A missing key surfaces as NotFound (HeadObject returns no body, so
            // the richer NoSuchKey error is unavailable); everything else — auth,
            // network, a wrong bucket — must keep propagating.
            if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
                return null;
            }
            throw err;
        }
    }

    async deleteObject(key: string): Promise<void> {
        await this.client.send(new DeleteObjectCommand({Bucket: this.bucket, Key: key}));
    }
}

function defaultPublicBaseUrl(config: S3Config): string {
    if (config.endpoint) {
        const endpoint = config.endpoint.replace(/\/+$/, "");
        return config.forcePathStyle ? `${endpoint}/${config.bucket}` : endpoint;
    }
    return `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
}
