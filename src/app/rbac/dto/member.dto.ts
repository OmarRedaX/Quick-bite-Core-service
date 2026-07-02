import { IsArray, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateMemberDTO {
    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsString()
    @IsNotEmpty()
    phoneNumber!: string;

    @IsString()
    @IsNotEmpty()
    role!: string;

    @IsArray()
    @IsOptional()
    branchIds!: number[];
}

export class UpdateMemberDTO {
    @IsOptional()
    @IsString()
    role?: string;

    @IsOptional()
    @IsIn(['active', 'inactive', 'suspended'])
    status?: string;
}

export class UpdateMemberBranchesDTO {
    @IsNotEmpty()
    @IsArray()
    branchIds!: number[];
}