import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateWebhookConfigDto {
  @ApiProperty({
    example: "Slack Alerts",
    description: "Human-readable name for the webhook configuration (1-100 characters)",
    minLength: 1,
    maxLength: 100,
    required: true,
  })
  @MaxLength(100, { message: "Webhook name must not exceed 100 characters" })
  @MinLength(1, { message: "Webhook name must be at least 1 character long" })
  @IsString({ message: "Webhook name must be a string" })
  @IsNotEmpty({ message: "Webhook name is required" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly name: string;

  @ApiProperty({
    example: "https://hooks.slack.com/services/xxx",
    description: "Valid HTTPS URL for the webhook endpoint",
    required: true,
  })
  @IsUrl(
    { require_protocol: true, protocols: ["https"] },
    { message: "Webhook URL must be a valid HTTPS URL" }
  )
  @IsString({ message: "Webhook URL must be a string" })
  @IsNotEmpty({ message: "Webhook URL is required" })
  readonly url: string;

  @ApiProperty({
    example: "super-secret-signing-key",
    description: "Secret key for signing webhook payloads (1-500 characters)",
    minLength: 1,
    maxLength: 500,
    required: true,
  })
  @MaxLength(500, { message: "Webhook secret must not exceed 500 characters" })
  @MinLength(1, { message: "Webhook secret must be at least 1 character long" })
  @IsString({ message: "Webhook secret must be a string" })
  @IsNotEmpty({ message: "Webhook secret is required" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  readonly secret: string;

  @ApiProperty({
    type: [String],
    example: ["workflow-execution.transition.completed", "workflow-execution.instance.cancelled"],
    description: "Array of NATS event names that trigger this webhook",
    required: true,
  })
  @IsString({ each: true, message: "Each event trigger must be a string" })
  @IsArray({ message: "Event triggers must be an array" })
  @IsNotEmpty({ message: "Event triggers are required" })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v) => (typeof v === "string" ? v.trim() : v)) : value
  )
  readonly eventTriggers: string[];

  @ApiPropertyOptional({
    description: "Whether this webhook configuration is active",
    example: true,
  })
  @IsBoolean({ message: "isActive must be a boolean" })
  @IsOptional()
  readonly isActive?: boolean;
}
