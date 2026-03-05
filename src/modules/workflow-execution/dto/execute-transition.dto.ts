import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, IsUUID, Min, MaxLength } from "class-validator";

export class ExecuteTransitionDto {
  @ApiProperty({ example: "uuid-of-transition" })
  @IsUUID()
  readonly transitionId: string;

  @ApiProperty({
    description: "Current optimistic lock version of the instance — prevents concurrent transitions",
    example: 1,
  })
  @IsInt()
  @Min(1)
  readonly expectedVersion: number;

  @ApiPropertyOptional({ example: "Approved — all documents verified." })
  @IsString()
  @IsOptional()
  readonly comment?: string;

  @ApiPropertyOptional({
    description: "Client-generated unique key to prevent duplicate transitions on retry",
    example: "req-abc123",
  })
  @IsString()
  @IsOptional()
  @MaxLength(128)
  readonly idempotencyKey?: string;
}
