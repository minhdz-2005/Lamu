import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
  ValidateIf,
} from "class-validator";
import type { components } from "../../../../../../shared/contracts/http/generated/identity";
export type Assignment = components["schemas"]["RoleAssignment"];
const lower = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.toLowerCase() : value;
const trimDescription = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() || null : value;
const descriptionPattern = /^[^\u0000]{0,1000}$/u;
type CreateOrganization = components["schemas"]["CreateOrganization"];
type UpdateOrganizationDescription =
  components["schemas"]["UpdateOrganizationDescription"];
export class CreateOrganizationDto implements CreateOrganization {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  name!: string;
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(3, 63)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  slug?: string;

  @Transform(trimDescription)
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @Matches(descriptionPattern)
  description?: string | null;
}
export class UpdateOrganizationDescriptionDto
  implements UpdateOrganizationDescription
{
  @Transform(trimDescription)
  @ValidateIf((_object, value: unknown) => value !== null)
  @Matches(descriptionPattern)
  description!: string | null;
}
export class AssignmentDto {
  @IsIn(["OWNER", "ADMIN", "SPEAKER", "ATTENDEE"]) code!: Assignment["code"];
  @IsIn(["ORG", "EVENT"]) resource_type!: Assignment["resource_type"];
  @Transform(lower) @IsUUID() resource_id!: string;
}
export class ReplaceRolesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AssignmentDto)
  roles!: AssignmentDto[];
}
export class AuthorizationDto {
  @Transform(lower) @IsUUID() user_id!: string;
  @Transform(lower) @IsUUID() organization_id!: string;
  @IsIn(["ORG", "EVENT"]) resource_type!: "ORG" | "EVENT";
  @Transform(lower) @IsUUID() resource_id!: string;
  @IsString() permission!: string;
}
