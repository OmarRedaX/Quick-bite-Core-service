import {IEmailProvider} from "../../src/pkg/email/email.interface"

export class EmailStub implements IEmailProvider {
    sent: Array<{to: string, subject: string, html: string}> = []
    /** When set, the next send() rejects with this error instead of recording the message. */
    failNextSendWith: Error | null = null
    async send(to: string, subject: string, html: string): Promise<void> {
        if (this.failNextSendWith) {
            const err = this.failNextSendWith;
            this.failNextSendWith = null;
            throw err;
        }
        this.sent.push({to, subject, html})
    }
    reset() :void {
        this.sent = []
        this.failNextSendWith = null
    }
}

export const emailstub = new EmailStub();