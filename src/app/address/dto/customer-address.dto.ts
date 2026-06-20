import { IsBoolean, IsEnum, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { AddressType } from "../enums";
import { Type } from "class-transformer";


export class CreateCustomerAddressDto {

    @IsString()
    @MinLength(2)
    @MaxLength(50)
    label!: string;

    @IsString()
    @MinLength(2)
    @MaxLength(50)
    country!: string;
    
    @IsString()
    @MinLength(2)
    @MaxLength(50)
    city!: string;

    @IsString()
    @MinLength(3)
    @MaxLength(255)
    street!: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    building?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    apartmentNumber?: string;

    @IsEnum(AddressType)
    type!: AddressType;

    @Type(() => Number)
    @IsLatitude()
    lat!: number;

    @Type(() => Number)
    @IsLongitude()
    lng!: number;

    @IsBoolean()
    isDefault!: boolean;
}

export class updateCustomerAddressDTO {
    
    @IsString()
    @MinLength(2)
    @MaxLength(50)
    label?: string;

    @IsString()
    @MinLength(2)
    @MaxLength(50)
    country?: string;
    
    @IsString()
    @MinLength(2)
    @MaxLength(50)
    city?: string;

    @IsString()
    @MinLength(3)
    @MaxLength(255)
    street?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    building?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    apartmentNumber?: string;

    @IsEnum(AddressType)
    type?: AddressType;

    @Type(() => Number)
    @IsLatitude()
    lat?: number;

    @Type(() => Number)
    @IsLongitude()
    lng?: number;

}