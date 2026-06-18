import path from "path";
import { config } from "dotenv";
import {z} from "zod";

config({path: path.resolve( __dirname, "../../../.env" )});

const schema = z.object({
  PORT: z.string().default("3000"),
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.string().default("5432"),
  DB_USER: z.string().default("postgres"),
  DB_PASSWORD: z.string().default("1234"),
  DB_NAME: z.string().default("quickbite_core"),
  DB_POOL_MAX: z.string().default("10"),
  DB_MIGRATION_DIRECTORY: z.string().default("./src/migrations"),
  DB_MIGRATION_EXTENSION: z.string().default("ts"),
  ACCESS_SECRET: z.string(),
  REFRESH_SERCRET: z.string(),
  ACCESS_EXPIRES_IN: z.string(),
  REFRESH_EXPIRES_IN: z.string(),
  NODE_ENV: z.string()
});

const parsed = schema.parse(process.env);

export const env = {
    port: Number(parsed.PORT),
    nodeEnv: parsed.NODE_ENV,
    db: {
        host: parsed.DB_HOST,
        port: Number(parsed.DB_PORT),
        user: parsed.DB_USER,
        password: parsed.DB_PASSWORD,
        name: parsed.DB_NAME,
        poolMax: Number(parsed.DB_POOL_MAX),
        migrationDirectory: path.resolve( __dirname, "../../../", parsed.DB_MIGRATION_DIRECTORY ),
        migrationExtension: parsed.DB_MIGRATION_EXTENSION
    },
    jwt: {
        accessSecret: parsed.ACCESS_SECRET,
        refreshSecret: parsed.REFRESH_SERCRET,
        accessExpiresIn: parsed.ACCESS_EXPIRES_IN,
        refreshExpiresIn: parsed.REFRESH_EXPIRES_IN
    }
};

