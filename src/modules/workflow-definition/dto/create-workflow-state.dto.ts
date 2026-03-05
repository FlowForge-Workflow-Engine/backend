import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateWorkflowStateDto {
  @ApiProperty({ example: 'Pending Approval' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  readonly name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  readonly description?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  readonly isInitial?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  readonly isTerminal?: boolean;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  readonly positionX?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  readonly positionY?: number;

  @ApiPropertyOptional({ example: { color: '#FF5733', icon: 'clock' } })
  @IsObject()
  @IsOptional()
  readonly metadata?: Record<string, unknown>;
}

