import { ApiProperty } from '@nestjs/swagger';
export class StockLocationDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) code!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, enum: ['WAREHOUSE', 'STUDIO', 'EXTERNAL'] }) type!: string;
  @ApiProperty({ type: Boolean }) isSellable!: boolean;
  @ApiProperty({ type: Boolean }) isDefault!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}
export class StockLocationPageDto {
  @ApiProperty({ type: [StockLocationDto] }) items!: readonly StockLocationDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
class ApiaryTranslationDto {
  @ApiProperty({ type: String }) locale!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
}
export class ApiaryQueryItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) code!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String }) region!: string;
  @ApiProperty({ type: String, nullable: true }) altitudeBand!: string | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: Boolean }) isOwnOperation!: boolean;
  @ApiProperty({ type: [ApiaryTranslationDto] }) translations!: readonly ApiaryTranslationDto[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}
export class ApiaryPageDto {
  @ApiProperty({ type: [ApiaryQueryItemDto] }) items!: readonly ApiaryQueryItemDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class AllocationQueryItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) harvestBatchId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) variantId!: string;
  @ApiProperty({ type: Number }) quantityUnits!: number;
  @ApiProperty({ type: String, format: 'date-time' }) packedAt!: string;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
export class AllocationPageDto {
  @ApiProperty({ type: [AllocationQueryItemDto] }) items!: readonly AllocationQueryItemDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
