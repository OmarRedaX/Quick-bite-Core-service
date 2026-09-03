import {config} from "dotenv"
import path from "path"

config( {path: path.resolve(__dirname, '../../.env.test')})

export default async function globalsetup() {
    const {db} = require ("../../src/lib/knex/knex")
    await db.destroy()
}