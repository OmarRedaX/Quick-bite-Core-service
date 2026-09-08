import {S3StorageProvider} from "../../pkg/storage/s3";
import {env} from "../config/env";

export const storageProvider = new S3StorageProvider({
    region: env.storage.region,
    bucket: env.storage.bucket,
    accessKeyId: env.storage.accessKeyId || undefined,
    secretAccessKey: env.storage.secretAccessKey || undefined,
    publicBaseUrl: env.storage.publicBaseUrl || undefined,
    endpoint: env.storage.endpoint || undefined,
    forcePathStyle: env.storage.forcePathStyle,
    uploadUrlTtlSeconds: env.storage.uploadUrlTtlSeconds,
});
