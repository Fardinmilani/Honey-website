import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ValidationIssueDto {
  @ApiProperty({ type: String, example: 'field' })
  path!: string;

  @ApiProperty({ type: String, example: 'INVALID_VALUE' })
  code!: string;
}

export class ProblemDetailsDto {
  @ApiProperty({ type: String, example: 'https://api.honey.invalid/problems/validation-failed' })
  type!: string;

  @ApiProperty({ type: String, example: 'Request validation failed' })
  title!: string;

  @ApiProperty({ type: Number, example: 422 })
  status!: number;

  @ApiProperty({ type: String, example: 'VALIDATION_FAILED' })
  code!: string;

  @ApiPropertyOptional({ type: String, example: 'The request could not be processed.' })
  detail?: string;

  @ApiProperty({ type: String, example: '/v1/example' })
  instance!: string;

  @ApiProperty({ type: String, example: '018f5d36-7b89-7a67-bb7a-e8f9f5db7412' })
  requestId!: string;

  @ApiPropertyOptional({ type: [ValidationIssueDto] })
  errors?: ValidationIssueDto[];
}
