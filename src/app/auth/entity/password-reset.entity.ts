export class PasswordReset {
    id: number;
    userId: number;
    otpHash: string;
    expiresAt: Date;
    consumedAt: Date;
    createdAt: Date;

    constructor( id: number, userId: number, otpHash: string, expiresAt: Date, consumedAt: Date, createdAt: Date ) {
        this.id = id;
        this.userId = userId;
        this.otpHash = otpHash;
        this.expiresAt = expiresAt;
        this.consumedAt = consumedAt;
        this.createdAt = createdAt;
    }

    isExpired(): boolean {
        return this.expiresAt < new Date();
    }
    
}