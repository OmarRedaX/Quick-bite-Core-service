import {IMessageBroker} from "../../src/pkg/messaging/message-broker.interface";

export interface PublishedMessage {
    exchange: string;
    routingKey: string;
    body: Buffer;
}

export class MessageBrokerStub implements IMessageBroker {
    published: PublishedMessage[] = [];
    /** When set, publishConfirmed rejects/throws this value instead of recording the message. */
    failNextPublishWith: unknown = null;

    async connect(): Promise<void> {}
    async close(): Promise<void> {}
    async declareExchange(_exchange: string): Promise<void> {}

    async publishConfirmed(exchange: string, routingKey: string, body: Buffer): Promise<void> {
        if (this.failNextPublishWith) {
            const err = this.failNextPublishWith;
            this.failNextPublishWith = null;
            throw err;
        }
        this.published.push({exchange, routingKey, body});
    }

    reset(): void {
        this.published = [];
        this.failNextPublishWith = null;
    }
}

export const messageBrokerStub = new MessageBrokerStub();
