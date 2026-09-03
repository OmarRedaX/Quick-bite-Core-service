import {config} from "dotenv"
import path from "path"

config( {path: path.resolve(__dirname, '../../.env.test')})

export default async function globalsetup() {
    const {db} = require ("../../src/lib/knex/knex")
    await db.migrate.latest()

    const {flushTestCache, closeRedisTestClient} = require("../helpers/redis")
    await flushTestCache()
    await closeRedisTestClient()
}