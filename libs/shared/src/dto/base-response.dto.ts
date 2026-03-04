import { ApiProperty, PickType } from '@nestjs/swagger';

export class ApiResponseDto<T = any> {
  @ApiProperty({ example: 'success' })
  status: string;

  @ApiProperty({ description: 'Response data', required: true })
  data: T;
}

export class CountApiResponseDto<T = any> extends ApiResponseDto<T> {
  @ApiProperty({ description: 'Response Count', required: true })
  count: number;
}

export class MessageResponseDto extends PickType(ApiResponseDto, ['status']) {
  @ApiProperty({ example: 'Data loaded successfully' })
  message: string;
}
