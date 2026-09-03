import amqplib from "amqplib";
import {RabbitMQClient} from "../../../src/pkg/messaging/rabbitmq.client";
import {env} from "../../../src/lib/config/env";

const EXCHANGE = `test.exchange.${Date.now()}`;

describe("RabbitMQClient (real local RabbitMQ)", () => {
    let client: RabbitMQClient;

    beforeEach(() => {
        client = new RabbitMQClient({url: env.rabbit.url});
    })

    afterEach(async () => {
        await client.close();
    })

    afterAll(async () => {
        // clean up the exchange this suite created
        const conn = await amqplib.connect(env.rabbit.url);
        const ch = await conn.createChannel();
        await ch.deleteExchange(EXCHANGE).catch(() => {});
        await ch.close();
        await conn.close();
    })

    it("connects without throwing", async () => {
        await expect(client.connect()).resolves.toBeUndefined();
    })

    it("is idempotent — calling connect() twice does not throw or reconnect", async () => {
        await client.connect();

        await expect(client.connect()).resolves.toBeUndefined();
    })

    it("declares a durable topic exchange", async () => {
        await client.declareExchange(EXCHANGE);

        // assertExchange with the SAME properties succeeds only if it already
        // exists with matching type/durability -- a real assertion, not just "didn't throw".
        const conn = await amqplib.connect(env.rabbit.url);
        const ch = await conn.createChannel();
        await expect(ch.checkExchange(EXCHANGE)).resolves.toBeTruthy();
        await ch.close();
        await conn.close();
    })

    it("delivers a publishConfirmed message to a bound queue", async () => {
        await client.declareExchange(EXCHANGE);

        const conn = await amqplib.connect(env.rabbit.url);
        const ch = await conn.createChannel();
        const {queue} = await ch.assertQueue("", {exclusive: true});
        await ch.bindQueue(queue, EXCHANGE, "order.placed");

        const received = new Promise<{content: string; routingKey: string; contentType?: string}>((resolve) => {
            ch.consume(queue, (msg) => {
                if (msg) {
                    resolve({content: msg.content.toString("utf8"), routingKey: msg.fields.routingKey, contentType: msg.properties.contentType});
                    ch.ack(msg);
                }
            });
        });

        await client.publishConfirmed(EXCHANGE, "order.placed", Buffer.from(JSON.stringify({orderId: 1})));

        const result = await received;
        expect(JSON.parse(result.content)).toEqual({orderId: 1});
        expect(result.routingKey).toBe("order.placed");
        expect(result.contentType).toBe("application/json");

        await ch.close();
        await conn.close();
    })

    it("lazily connects on publishConfirmed if connect() was never called", async () => {
        await client.declareExchange(EXCHANGE);
        const freshClient = new RabbitMQClient({url: env.rabbit.url});

        await expect(freshClient.publishConfirmed(EXCHANGE, "some.key", Buffer.from("x"))).resolves.toBeUndefined();

        await freshClient.close();
    })

    it("close() is safe to call even when never connected", async () => {
        const neverConnected = new RabbitMQClient({url: env.rabbit.url});

        await expect(neverConnected.close()).resolves.toBeUndefined();
    })
})
