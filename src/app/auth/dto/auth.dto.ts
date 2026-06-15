import { IsEmail, IsEnum, IsString, IsStrongPassword, MaxLength, MinLength } from "class-validator";
import { SystemRole } from "../../user/enums";

// DTO -> Data transfer object
export class RegisterDTO {
    @IsEmail()
    email!: string;

    @MinLength(10)
    @MaxLength(11)
    phone!: string;

    @IsString()
    @MinLength(1)
    name!: string;
   
    @IsStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1
    }, {
        message: "Password is not strongg enough. It must contain at least 8 characters, one uppercase letter, one lowercase letter, one number, and one symbol"
    })
    password!: string;

    @IsEnum(SystemRole)
    role!: SystemRole;

}