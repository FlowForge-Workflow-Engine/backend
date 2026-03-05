import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "user@acme.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "S3cur3P@ss!", minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
