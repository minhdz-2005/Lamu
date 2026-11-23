import { Transform } from "class-transformer";
import { IsEmail, MaxLength } from "class-validator";
import { ReplaceRolesDto } from "./organization.dto";
import type { components } from "../../../../../../shared/contracts/http/generated/identity";
type CreateInvitation = components["schemas"]["CreateInvitation"];
export class CreateInvitationDto
  extends ReplaceRolesDto
  implements Pick<CreateInvitation, "email">
{
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
