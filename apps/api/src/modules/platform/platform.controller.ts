import { Controller, Get, Header, Inject } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { HealthService } from '@honey/backend';
import { ProblemDetailsDto } from '../../http/errors/problem-details.js';
import { Public } from '../../http/auth/authorization.js';

class HealthResponseDto {
  @ApiProperty({ type: String, enum: ['ok'], example: 'ok' })
  status!: 'ok';
}

class ReadyResponseDto {
  @ApiProperty({ type: String, enum: ['ready'], example: 'ready' })
  status!: 'ready';

  @ApiProperty({
    type: 'object',
    properties: { database: { type: 'string', enum: ['ready'], example: 'ready' } },
    required: ['database'],
    additionalProperties: false,
  })
  checks!: { database: 'ready' };
}

@ApiTags('Operations')
@Controller()
export class PlatformController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get('healthz')
  @Public()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'getHealth',
    summary: 'Check process liveness',
    description: 'Reports whether the HTTP process is alive without querying dependencies.',
  })
  @ApiOkResponse({ type: HealthResponseDto, description: 'The HTTP process is alive.' })
  @ApiInternalServerErrorResponse({
    type: ProblemDetailsDto,
    description: 'An unexpected failure occurred.',
  })
  healthz(): HealthResponseDto {
    return { status: 'ok' };
  }

  @Get('readyz')
  @Public()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'getReadiness',
    summary: 'Check required dependencies',
    description: 'Reports readiness after a bounded PostgreSQL dependency check.',
  })
  @ApiOkResponse({ type: ReadyResponseDto, description: 'All required dependencies are ready.' })
  @ApiServiceUnavailableResponse({
    type: ProblemDetailsDto,
    description: 'A required dependency is unavailable.',
  })
  @ApiInternalServerErrorResponse({
    type: ProblemDetailsDto,
    description: 'An unexpected failure occurred.',
  })
  async readyz(): Promise<ReadyResponseDto> {
    return this.health.readiness();
  }
}
