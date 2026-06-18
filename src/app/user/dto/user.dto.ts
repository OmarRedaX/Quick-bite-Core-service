import { IsString, MaxLength, MinLength } from "class-validator";
import { IsAtLeastOneRequired } from "../../../common/validation/decorators";


export class UpdateUserDTO {
    @IsAtLeastOneRequired(['name', 'phone'])
    @IsString()
    @MinLength(1)
    name?: string;

    @MinLength(10)
    @MaxLength(11)
    phone?: string;
}