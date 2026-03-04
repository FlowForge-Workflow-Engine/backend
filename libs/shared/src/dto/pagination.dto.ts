import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsNumber, Min, Max } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ description: 'Page number', type: Number })
  @Min(1)
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Number of items per page', type: Number })
  @Max(100)
  @Min(1)
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  limit?: number;
}
