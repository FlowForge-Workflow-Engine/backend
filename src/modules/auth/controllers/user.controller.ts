import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IdParamDto } from '@app/shared/dto/id-param.dto';
import { CurrentUser } from '@app/shared/decorators/current-user.decorator';
import { TenantId } from '@app/shared/decorators/tenant-id.decorator';
import { IJwtPayload } from '@app/shared/interfaces/jwt-payload.interface';
import { UserService } from '../services/user.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { AssignRoleDto } from '../dto/assign-role.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'List all users within the authenticated tenant' })
  findAll(@TenantId() tenantId: string) {
    return this.userService.findAll(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a user within the authenticated tenant' })
  create(
    @Body() dto: CreateUserDto,
    @TenantId() tenantId: string,
    @CurrentUser() actor: IJwtPayload,
  ) {
    return this.userService.create(dto, tenantId, actor.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID within the authenticated tenant' })
  findOne(@Param() { id }: IdParamDto, @TenantId() tenantId: string) {
    return this.userService.findById(id, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deactivate a user' })
  deactivate(@Param() { id }: IdParamDto, @TenantId() tenantId: string) {
    return this.userService.deactivate(id, tenantId);
  }

  @Post(':id/roles')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Assign a role to a user' })
  assignRole(
    @Param() { id }: IdParamDto,
    @Body() dto: AssignRoleDto,
    @TenantId() tenantId: string,
    @CurrentUser() actor: IJwtPayload,
  ) {
    return this.userService.assignRole(id, dto.roleId, tenantId, actor.sub);
  }
}

