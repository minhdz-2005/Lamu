import { Transform } from "class-transformer";
import { IsEmail, IsString, Length, MaxLength, Matches } from "class-validator";
export class LoginDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @IsString() @Length(8, 128) password!: string;
}
export class RegisterDto extends LoginDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  display_name!: string;
}
export class RefreshDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) refresh_token!: string;
}
