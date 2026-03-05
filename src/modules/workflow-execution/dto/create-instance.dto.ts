import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsUUID } from 'class-validator';

export class CreateInstanceDto {
  @ApiProperty({ example: 'uuid-of-workflow-definition' })
  @IsUUID()
  readonly workflowDefinitionId: string;

  @ApiPropertyOptional({
    description: 'Initial form payload for the workflow instance',
    example: { requestedBy: 'John Doe', amount: 5000 },
  })
  @IsObject()
  @IsOptional()
  readonly payload?: Record<string, unknown>;
}

