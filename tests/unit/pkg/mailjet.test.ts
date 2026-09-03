const requestMock = jest.fn().mockResolvedValue({body: {Messages: [{Status: "success"}]}});
const postMock = jest.fn(() => ({request: requestMock}));
const MailjetCtorMock = jest.fn().mockImplementation(() => ({post: postMock}));

jest.mock("node-mailjet", () => ({
    __esModule: true,
    default: MailjetCtorMock,
}));

import {MailjetEmailProvider} from "../../../src/pkg/email/mailjet";

describe("MailjetEmailProvider", () => {
    beforeEach(() => {
        MailjetCtorMock.mockClear();
        postMock.mockClear();
        requestMock.mockClear();
    })

    it("constructs the Mailjet client with the configured API credentials", () => {
        new MailjetEmailProvider({apiKey: "key", secretKey: "secret", fromEmail: "from@example.com", fromName: "QuickBite"});

        expect(MailjetCtorMock).toHaveBeenCalledWith({apiKey: "key", apiSecret: "secret"});
    })

    it("sends via POST send v3.1 with the configured From and the given To/Subject/HTML", async () => {
        const provider = new MailjetEmailProvider({apiKey: "key", secretKey: "secret", fromEmail: "from@example.com", fromName: "QuickBite"});

        await provider.send("user@example.com", "Subject Line", "<p>body</p>");

        expect(postMock).toHaveBeenCalledWith("send", {version: "v3.1"});
        expect(requestMock).toHaveBeenCalledWith({
            Messages: [{
                From: {Email: "from@example.com", Name: "QuickBite"},
                To: [{Email: "user@example.com"}],
                Subject: "Subject Line",
                HTMLPart: "<p>body</p>",
            }],
        });
    })

    it("propagates a rejection from the Mailjet API", async () => {
        requestMock.mockRejectedValueOnce(new Error("mailjet down"));
        const provider = new MailjetEmailProvider({apiKey: "key", secretKey: "secret", fromEmail: "from@example.com", fromName: "QuickBite"});

        await expect(provider.send("user@example.com", "s", "h")).rejects.toThrow("mailjet down");
    })
})
