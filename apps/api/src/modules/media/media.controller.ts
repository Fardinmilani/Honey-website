import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsUUID, Max, Min } from 'class-validator';
import type { FastifyRequest } from 'fastify';

import {
  MEDIA_MIME_TYPES,
  MEDIA_VISIBILITIES,
  MediaService,
  type MediaAsset,
  type MediaVisibility,
} from '@honey/backend';
import { RequirePermissions } from '../../http/auth/authorization.js';
import { requestMetadata, requestPrincipal } from '../../http/auth/request-principal.js';
import { ProblemDetailsDto } from '../../http/errors/problem-details.js';

class MediaIdParamDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  assetId!: string;
}

class UploadIdParamDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  uploadId!: string;
}

class CreateMediaUploadIntentDto {
  @ApiProperty({ type: String, enum: MEDIA_MIME_TYPES, example: 'image/jpeg' })
  @IsIn(MEDIA_MIME_TYPES)
  declaredMimeType!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 500_000_000, example: 245760 })
  @IsInt()
  @Min(1)
  @Max(500_000_000)
  declaredBytes!: number;

  @ApiProperty({ type: String, enum: MEDIA_VISIBILITIES, example: 'PUBLIC' })
  @IsIn(MEDIA_VISIBILITIES)
  visibility!: MediaVisibility;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', minLength: 1, maxLength: 300 },
    example: { fa: 'شیشه عسل در نور طبیعی', en: 'Honey jar in natural light' },
  })
  @IsObject()
  altTextByLocale!: Record<string, string>;
}

class UpdateMediaAltTextDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', minLength: 1, maxLength: 300 },
    example: { fa: 'عسل در کنار گل‌های کوهی', en: 'Honey beside mountain flowers' },
  })
  @IsObject()
  altTextByLocale!: Record<string, string>;
}

class DirectUploadDto {
  @ApiProperty({ type: String, enum: ['POST'] })
  method!: 'POST';

  @ApiProperty({ type: String, format: 'uri' })
  url!: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  fields!: Readonly<Record<string, string>>;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;
}

class MediaUploadIntentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  uploadId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  assetId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: DirectUploadDto })
  upload!: DirectUploadDto;
}

class MediaDerivativeDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, enum: ['thumb', 'card', 'hero', 'og'] })
  variant!: string;

  @ApiProperty({ type: String, enum: ['webp', 'jpg'] })
  format!: string;

  @ApiProperty({ type: String, enum: ['image/webp', 'image/jpeg'] })
  mimeType!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  width!: number;

  @ApiProperty({ type: Number, minimum: 1 })
  height!: number;

  @ApiProperty({ type: Number, minimum: 1 })
  bytes!: number;

  @ApiProperty({ type: String, pattern: '^[0-9a-f]{64}$' })
  checksum!: string;

  @ApiProperty({ type: String, format: 'uri', nullable: true })
  url!: string | null;
}

class MediaAssetDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, enum: ['IMAGE', 'VIDEO'] })
  kind!: string;

  @ApiProperty({ type: String, enum: MEDIA_VISIBILITIES })
  visibility!: string;

  @ApiProperty({ type: String, enum: MEDIA_MIME_TYPES })
  mimeType!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  bytes!: number;

  @ApiProperty({ type: Number, minimum: 1, nullable: true })
  width!: number | null;

  @ApiProperty({ type: Number, minimum: 1, nullable: true })
  height!: number | null;

  @ApiProperty({ type: Number, minimum: 0, nullable: true })
  durationSeconds!: number | null;

  @ApiProperty({ type: String, pattern: '^[0-9a-f]{64}$' })
  checksum!: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  altTextByLocale!: Readonly<Record<string, string>>;

  @ApiProperty({ type: String, format: 'uri', nullable: true })
  url!: string | null;

  @ApiProperty({ type: String, format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: [MediaDerivativeDto] })
  derivatives!: readonly MediaDerivativeDto[];
}

class PrivateMediaUrlDto {
  @ApiProperty({ type: String, format: 'uri' })
  url!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;
}

@ApiTags('Media')
@Controller('v1/admin/media')
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @Post('upload-intents')
  @RequirePermissions('content:write')
  @ApiOperation({
    operationId: 'createMediaUploadIntent',
    summary: 'Authorize one direct media upload',
    description:
      'Creates an owner-bound, short-lived upload intent and a constrained direct-to-storage POST authorization.',
  })
  @ApiCreatedResponse({ type: MediaUploadIntentDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  createUploadIntent(
    @Body() input: CreateMediaUploadIntentDto,
    @Req() request: FastifyRequest,
  ): Promise<MediaUploadIntentDto> {
    return this.media.createUploadIntent(requestPrincipal(request), input);
  }

  @Post('upload-intents/:uploadId/complete')
  @RequirePermissions('content:write')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'completeMediaUpload',
    summary: 'Verify and process a direct upload',
    description:
      'Consumes the owner-bound intent, verifies stored bytes by magic number, processes images, and persists only trusted metadata.',
  })
  @ApiParam({ name: 'uploadId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: MediaAssetDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  completeUpload(
    @Param() params: UploadIdParamDto,
    @Req() request: FastifyRequest,
  ): Promise<MediaAsset> {
    return this.media.completeUpload(
      requestPrincipal(request),
      params.uploadId,
      requestMetadata(request),
    );
  }

  @Get(':assetId')
  @RequirePermissions('content:write')
  @ApiOperation({
    operationId: 'getMediaAsset',
    summary: 'Get trusted media metadata',
    description: 'Returns safe persisted metadata and canonical public URLs only when public.',
  })
  @ApiParam({ name: 'assetId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: MediaAssetDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  getAsset(@Param() params: MediaIdParamDto, @Req() request: FastifyRequest): Promise<MediaAsset> {
    return this.media.getAsset(requestPrincipal(request), params.assetId);
  }

  @Patch(':assetId/alt-text')
  @RequirePermissions('content:write')
  @ApiOperation({
    operationId: 'updateMediaAltText',
    summary: 'Replace localized media alt text',
    description: 'Validates canonical BCP-47 locale keys and bounded plain-text values.',
  })
  @ApiParam({ name: 'assetId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: MediaAssetDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiUnprocessableEntityResponse({ type: ProblemDetailsDto })
  updateAltText(
    @Param() params: MediaIdParamDto,
    @Body() input: UpdateMediaAltTextDto,
    @Req() request: FastifyRequest,
  ): Promise<MediaAsset> {
    return this.media.updateAltText(
      requestPrincipal(request),
      params.assetId,
      input.altTextByLocale,
      requestMetadata(request),
    );
  }

  @Post(':assetId/private-url')
  @RequirePermissions('content:write')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'createPrivateMediaUrl',
    summary: 'Create a short-lived private media URL',
    description: 'Signs only the stored key of an authorized private media asset.',
  })
  @ApiParam({ name: 'assetId', type: String, format: 'uuid' })
  @ApiOkResponse({ type: PrivateMediaUrlDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  createPrivateUrl(
    @Param() params: MediaIdParamDto,
    @Req() request: FastifyRequest,
  ): Promise<PrivateMediaUrlDto> {
    return this.media.createPrivateDownload(requestPrincipal(request), params.assetId);
  }

  @Delete(':assetId')
  @RequirePermissions('content:write')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'deleteMediaAsset',
    summary: 'Delete an unattached media asset',
    description: 'Deletes only a media asset that is not protected by an attachment constraint.',
  })
  @ApiParam({ name: 'assetId', type: String, format: 'uuid' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  @ApiConflictResponse({ type: ProblemDetailsDto })
  deleteAsset(@Param() params: MediaIdParamDto, @Req() request: FastifyRequest): Promise<void> {
    return this.media.deleteAsset(
      requestPrincipal(request),
      params.assetId,
      requestMetadata(request),
    );
  }
}
