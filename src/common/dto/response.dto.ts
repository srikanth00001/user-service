import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto {
  @ApiProperty({
    example: true,
    description: 'Indicates if the request was successful',
  })
  success: boolean;

  @ApiProperty({
    example: 'Request completed successfully',
    description: 'Response message',
  })
  message: string;

  @ApiProperty({
    description: 'Response data',
    required: false,
    example: { id: '1', name: 'Example' },
  })
  data?: any;

  constructor({
    success,
    message,
    data,
  }: {
    success: boolean;
    message: string;
    data?: any;
  }) {
    this.success = success;
    this.message = message;
    this.data = data;
  }
}
