import knex from "knex";
import {env} from "../config/env.js";
import type {Knex} from 'knex'; 

const config: Knex.Config = {
    client: "pg",
    connection: {
        host: env.db.host,
        port: env.db.port,
        user: env.db.user,
        password: env.db.password,
        database: env.db.name
    },
    pool: {
        max: env.db.poolMax
    },
    migrations: {
        directory: "./src/migrations",
        extension: "ts"
    }
}

export const db = knex(config);

export async function pingDB() {
    await db.raw("SELECT 1");
}