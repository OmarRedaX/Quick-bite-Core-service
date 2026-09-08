import path from 'path';
import {config} from 'dotenv';
import {z} from 'zod';
import type {StringValue} from 'ms';

// C:\Users\ABDULLAH\Desktop\quickbite\core-service\.env
config({path: path.resolve(__dirname,'../../../.env')});

// Matches jsonwebtoken's expiresIn format: a plain number of seconds ("3600"),
// or a number plus unit, with or without a space ("15m", "7 days").
const EXPIRES_IN_REGEX = /^\d+(\.\d+)?\s?[a-zA-Z]*$/;
const expiresInMessage = "must be a number of seconds or a timespan like '15m', '7d'";

const schema = z.object({
    PORT: z.string().default("3000"),
    DB_HOST: z.string().default("localhost"),
    DB_PORT: z.string().default("5432"),
    DB_USERNAME: z.string().default("postgres"),
    DB_PASSWORD: z.string(),
    DB_NAME: z.string(),
    DB_POOL_MAX: z.string().default('10'),
    DB_MIGRATION_DIRECTORY: z.string(),
    DB_MIGRATION_EXTENSION: z.string(),
    ACCESS_SECRET: z.string(),
    REFRESH_SECRET: z.string(),
    ACCESS_EXPIRES_IN: z.string().regex(EXPIRES_IN_REGEX, expiresInMessage),
    REFRESH_EXPIRES_IN: z.string().regex(EXPIRES_IN_REGEX, expiresInMessage),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.string().default('6379'),
    REDIS_PASSWORD: z.string().default(""),
    MAILJET_API_KEY: z.string(),
    MAILJET_SECRET_KEY: z.string(),
    MAILJET_FROM_EMAIL: z.string(),
    MAILJET_FROM_NAME: z.string(),

    // Shared secret checked by requireInternalApiKey on every /api/internal/* request.
    INTERNAL_API_KEY: z.string().default(""),

    // RabbitMQ — used by the outbox worker.
    RABBITMQ_URL: z.string().default("amqp://guest:guest@localhost:5672"),
    RABBITMQ_CORE_EVENTS_EXCHANGE: z.string().default("core.events"),
    // Cron expression for the outbox drain schedule. 6-field form; "* * * * * *" = every second.
    OUTBOX_DRAIN_CRON: z.string().default("* * * * * *"),
    OUTBOX_BATCH_SIZE: z.string().default("50"),

    // AWS S3 (media uploads). Blank credentials are intentional: they let the
    // SDK fall back to its default provider chain (IAM role) in deployed
    // environments, and keep the schema parseable in test/CI where no bucket exists.
    AWS_REGION: z.string().default("us-east-1"),
    AWS_S3_BUCKET: z.string().default(""),
    AWS_ACCESS_KEY_ID: z.string().default(""),
    AWS_SECRET_ACCESS_KEY: z.string().default(""),
    // Serve objects from a CDN/custom domain instead of the raw bucket URL.
    S3_PUBLIC_BASE_URL: z.string().default(""),
    // S3-compatible endpoint for local dev (MinIO/LocalStack); blank = real AWS.
    S3_ENDPOINT: z.string().default(""),
    S3_FORCE_PATH_STYLE: z.string().default("false"),
    // How long a presigned upload URL stays valid.
    MEDIA_UPLOAD_URL_TTL: z.string().default("900"),
    // Rejected on finalize (a presigned PUT can't cap size up front).
    MEDIA_MAX_UPLOAD_BYTES: z.string().default("5242880"),
});

// jsonwebtoken reads expiresIn by TYPE: a number means seconds, but a numeric
// STRING goes through ms(), which reads bare digits as milliseconds -- so "3600"
// would sign a 3.6-second token, not a one-hour one. Normalize here so both
// "3600" and "15m" mean what they look like.
function toExpiresIn(value: string): number | StringValue {
    return /^\d+$/.test(value) ? Number(value) : (value as StringValue);
}

const parsed = schema.parse(process.env);

export const env = {
    port: Number(parsed.PORT),
    db: {
       host: parsed.DB_HOST,
       port: Number(parsed.DB_PORT),
       username: parsed.DB_USERNAME,
       password: parsed.DB_PASSWORD,
       name: parsed.DB_NAME,
       poolMax: Number(parsed.DB_POOL_MAX),
        migrationDirectory: path.resolve(__dirname,"../../../",parsed.DB_MIGRATION_DIRECTORY),
        migrationExtension: parsed.DB_MIGRATION_EXTENSION,
    },
    jwt: {
        refreshSecret: parsed.REFRESH_SECRET,
        accessSecret: parsed.ACCESS_SECRET,
        accessExpiresIn: toExpiresIn(parsed.ACCESS_EXPIRES_IN),
        refreshExpiresIn: toExpiresIn(parsed.REFRESH_EXPIRES_IN),
    },
    isProduction: process.env.NODE_ENV === "production",
    cors: {
        origins: parsed.CORS_ORIGINS.split(','),
    },
    // redis
    redis: {
        host: parsed.REDIS_HOST,
        port: Number(parsed.REDIS_PORT),
        password: parsed.REDIS_PASSWORD,
    },
    mailjet: {
        apiKey: parsed.MAILJET_API_KEY,
        secretKey: parsed.MAILJET_SECRET_KEY,
        fromEmail: parsed.MAILJET_FROM_EMAIL,
        fromName: parsed.MAILJET_FROM_NAME,
    },
    internal: {
        apiKey: parsed.INTERNAL_API_KEY,
    },
    rabbit: {
        url: parsed.RABBITMQ_URL,
        exchange: parsed.RABBITMQ_CORE_EVENTS_EXCHANGE,
        drainCron: parsed.OUTBOX_DRAIN_CRON,
        batchSize: Number(parsed.OUTBOX_BATCH_SIZE),
    },
    storage: {
        region: parsed.AWS_REGION,
        bucket: parsed.AWS_S3_BUCKET,
        accessKeyId: parsed.AWS_ACCESS_KEY_ID,
        secretAccessKey: parsed.AWS_SECRET_ACCESS_KEY,
        publicBaseUrl: parsed.S3_PUBLIC_BASE_URL,
        endpoint: parsed.S3_ENDPOINT,
        forcePathStyle: parsed.S3_FORCE_PATH_STYLE === "true",
        uploadUrlTtlSeconds: Number(parsed.MEDIA_UPLOAD_URL_TTL),
        maxUploadBytes: Number(parsed.MEDIA_MAX_UPLOAD_BYTES),
    },
}