import {IsString, IsNotEmpty, IsNumber, IsInt, Min, IsEnum} from "class-validator";
import { Currency } from "../enums";


export class CreateBranchDTO {
    @IsString()
    @IsNotEmpty()
    countryCode!: string;

    @IsString()
    @IsNotEmpty()
    label!: string;

    @IsString()
    @IsNotEmpty()
    addressText!: string;

    @IsNumber()
    lat!: number;

    @IsNumber()
    lng!: number;

    @IsString()
    opensAt!: string;

    @IsString()
    closesAt!: string;

    @IsInt()
    @Min(0)
    deliveryRadius!: number;

    @IsEnum(Currency)
    currency!: Currency;
}