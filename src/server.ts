import http from "http";
import {createApp} from "./app.js";
import {env} from "./common/config/env.js";
import {db} from "./common/knex/knex.js";

const app = createApp();
const server = http.createServer(app);

server.listen(env.port, () => {
    console.log(`Server is running on port ${env.port}`);
});

async function shutdown() {
    server.close(async() => {
        console.log("Shutting down server...");
        await db.destroy(); 
        process.exit(0);
    })
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown)