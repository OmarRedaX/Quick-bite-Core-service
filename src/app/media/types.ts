import {Media} from "./entity/media.entity";

export interface UploadTicket {
    media: Media;
    /** Presigned URL the client PUTs the file to, with Content-Type set to `media.contentType`. */
    uploadUrl: string;
    /** Seconds until `uploadUrl` stops being accepted. */
    expiresIn: number;
}
