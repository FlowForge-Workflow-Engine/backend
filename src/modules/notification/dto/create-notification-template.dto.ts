import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { NotificationChannel } from '../entities/notification-template.entity';

export class CreateNotificationTemplateDto {
  @ApiProperty({ example: 'workflow-execution.transition.completed' })
  @IsString()
  @IsNotEmpty()
  readonly eventTrigger: string;

  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  readonly channel: NotificationChannel;

  @ApiPropertyOptional({ example: 'Your request has been {{action}}' })
  @IsString()
  @IsOptional()
  readonly subjectTemplate?: string;

  @ApiProperty({ example: 'Hello {{actorEmail}}, the transition {{transitionName}} was completed.' })
  @IsString()
  @IsNotEmpty()
  readonly bodyTemplate: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  readonly isActive?: boolean;
}

