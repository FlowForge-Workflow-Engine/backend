import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class CreateWebhookConfigDto {
  @ApiProperty({ example: "Slack Alerts" })
  @IsString()
  @IsNotEmpty()
  readonly name: string;

  @ApiProperty({ example: "https://hooks.slack.com/services/xxx" })
  @IsUrl()
  readonly url: string;

  @ApiProperty({ example: "super-secret-signing-key" })
  @IsString()
  @IsNotEmpty()
  readonly secret: string;

  @ApiProperty({
    type: [String],
    example: ["workflow-execution.transition.completed", "workflow-execution.instance.cancelled"],
  })
  @IsArray()
  @IsString({ each: true })
  readonly eventTriggers: string[];

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  readonly isActive?: boolean;
}
