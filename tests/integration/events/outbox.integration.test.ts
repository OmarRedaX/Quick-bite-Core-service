import "reflect-metadata"
import {truncateAll} from "../../helpers/db";
import {messageBrokerStub} from "../../helpers/message-broker-stub";

jest.mock("../../../src/lib/events/init", () => ({
    messageBroker: messageBrokerStub
}))

import {db} from "../../../src/lib/knex/knex";
import {env} from "../../../src/lib/config/env";
import {insertOutboxEvent, insertOutboxEvents, claimBatch, markDispatched, markFailed} from "../../../src/lib/events/outbox.repo";
import {drainOutbox} from "../../../src/lib/events/outbox-drain";

describe("outbox", () => {
    beforeEach(async () => {
        await truncateAll();
        messageBrokerStub.reset();
    })

    describe("insertOutboxEvent / insertOutboxEvents", () => {
        it("persists a row with a stringified aggregateId and JSON payload", async () => {
            await insertOutboxEvent(db, {
                aggregateType: "restaurants",
                aggregateId: 42,
                eventType: "restaurant.suspended",
                payload: {restaurantId: 42},
            });

            const row = await db("events_outbox").first();
            expect(row.aggregate_type).toBe("restaurants");
            expect(row.aggregate_id).toBe("42");
            expect(row.event_type).toBe("restaurant.suspended");
            expect(row.dispatched_at).toBeNull();
            expect(row.attempts).toBe(0);
            expect(row.payload).toEqual({restaurantId: 42});
        })

        it("bulk-inserts multiple rows in one call", async () => {
            await insertOutboxEvents(db, [
                {aggregateType: "products", aggregateId: "1:1", eventType: "product.stock.changed", payload: {a: 1}},
                {aggregateType: "products", aggregateId: "1:2", eventType: "product.stock.changed", payload: {a: 2}},
            ]);

            const count = await db("events_outbox").count("* as n").first();
            expect(count).toEqual({n: "2"});
        })

        it("does nothing for an empty array", async () => {
            await insertOutboxEvents(db, []);

            const count = await db("events_outbox").count("* as n").first();
            expect(count).toEqual({n: "0"});
        })
    })

    describe("claimBatch", () => {
        it("only returns undispatched rows, oldest first, up to the limit", async () => {
            await insertOutboxEvent(db, {aggregateType: "a", aggregateId: 1, eventType: "t1", payload: {}});
            await insertOutboxEvent(db, {aggregateType: "a", aggregateId: 2, eventType: "t2", payload: {}});
            await insertOutboxEvent(db, {aggregateType: "a", aggregateId: 3, eventType: "t3", payload: {}});
            const first = await db("events_outbox").orderBy("id", "asc").first();
            await markDispatched(db, first.id);

            const trx = await db.transaction();
            const claimed = await claimBatch(trx, 10);
            await trx.commit();

            expect(claimed).toHaveLength(2);
            expect(claimed.every((r) => Number(r.id) !== Number(first.id))).toBe(true);
        })

        it("respects the limit", async () => {
            for (let i = 0; i < 5; i++) {
                await insertOutboxEvent(db, {aggregateType: "a", aggregateId: i, eventType: "t", payload: {}});
            }

            const trx = await db.transaction();
            const claimed = await claimBatch(trx, 2);
            await trx.commit();

            expect(claimed).toHaveLength(2);
        })
    })

    describe("markFailed", () => {
        it("increments attempts and stores the error, truncated to 2000 chars", async () => {
            await insertOutboxEvent(db, {aggregateType: "a", aggregateId: 1, eventType: "t", payload: {}});
            const row = await db("events_outbox").first();

            const longError = "x".repeat(3000);
            await markFailed(db, row.id, longError);
            await markFailed(db, row.id, "second failure");

            const updated = await db("events_outbox").where("id", row.id).first();
            expect(updated.attempts).toBe(2);
            expect(updated.last_error).toBe("second failure");
            expect(updated.last_error.length).toBeLessThanOrEqual(2000);
        })
    })

    describe("drainOutbox", () => {
        it("publishes pending rows and marks them dispatched", async () => {
            await insertOutboxEvent(db, {
                aggregateType: "restaurant_branches",
                aggregateId: 7,
                eventType: "branch.updated",
                payload: {branchId: 7},
            });

            await drainOutbox();

            expect(messageBrokerStub.published).toHaveLength(1);
            expect(messageBrokerStub.published[0]).toMatchObject({
                exchange: env.rabbit.exchange,
                routingKey: "branch.updated",
            });
            const envelope = JSON.parse(messageBrokerStub.published[0].body.toString("utf8"));
            expect(envelope).toMatchObject({eventType: "branch.updated", aggregateType: "restaurant_branches", aggregateId: "7"});

            const row = await db("events_outbox").first();
            expect(row.dispatched_at).not.toBeNull();
        })

        it("does nothing when the outbox is empty", async () => {
            await expect(drainOutbox()).resolves.toBeUndefined();
            expect(messageBrokerStub.published).toHaveLength(0);
        })

        it("marks a row failed and stops the batch (leaving later rows pending) when publish rejects", async () => {
            await insertOutboxEvent(db, {aggregateType: "a", aggregateId: 1, eventType: "t1", payload: {}});
            await insertOutboxEvent(db, {aggregateType: "a", aggregateId: 2, eventType: "t2", payload: {}});
            messageBrokerStub.failNextPublishWith = new Error("broker unavailable");

            await drainOutbox();

            const rows = await db("events_outbox").orderBy("id", "asc");
            expect(rows[0].dispatched_at).toBeNull();
            expect(rows[0].attempts).toBe(1);
            expect(rows[0].last_error).toBe("broker unavailable");
            // second row was claimed by the same trx but never reached (loop broke) -- stays pending, untouched
            expect(rows[1].dispatched_at).toBeNull();
            expect(rows[1].attempts).toBe(0);
        })

        it("joins a nested {errors:[...]} rejection (amqplib-style) into one message", async () => {
            await insertOutboxEvent(db, {aggregateType: "a", aggregateId: 1, eventType: "t1", payload: {}});
            messageBrokerStub.failNextPublishWith = {errors: [new Error("e1"), new Error("e2")]};

            await drainOutbox();

            const row = await db("events_outbox").first();
            expect(row.last_error).toBe("e1; e2");
        })

        it("JSON-stringifies a plain rejection object with no message/errors shape", async () => {
            await insertOutboxEvent(db, {aggregateType: "a", aggregateId: 1, eventType: "t1", payload: {}});
            messageBrokerStub.failNextPublishWith = {foo: "bar"};

            await drainOutbox();

            const row = await db("events_outbox").first();
            expect(row.last_error).toBe(JSON.stringify({foo: "bar"}));
        })

        it("retries a previously-failed row on the next drain once the broker recovers", async () => {
            await insertOutboxEvent(db, {aggregateType: "a", aggregateId: 1, eventType: "t1", payload: {}});
            messageBrokerStub.failNextPublishWith = new Error("broker unavailable");
            await drainOutbox();

            await drainOutbox();

            const row = await db("events_outbox").first();
            expect(row.dispatched_at).not.toBeNull();
            expect(messageBrokerStub.published).toHaveLength(1);
        })
    })
})
