import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Public } from '../http/auth/authorization.js';

class ValidationProbeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  value!: string;
}

@ApiExcludeController()
@Controller('__testing')
export class ValidationProbeController {
  @Post('validation')
  @Public()
  validate(@Body() input: ValidationProbeDto): Readonly<{ value: string }> {
    return { value: input.value };
  }

  @Get('unexpected')
  @Public()
  unexpected(): never {
    throw new Error('internal database and stack detail');
  }
}
