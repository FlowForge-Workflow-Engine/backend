import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({ description: 'UUID of the role to assign', format: 'uuid' })
  @IsUUID('4')
  roleId: string;
}

