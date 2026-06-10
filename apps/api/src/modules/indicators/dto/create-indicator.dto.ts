import { IsString, IsEnum, IsOptional, IsBoolean, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateIndicatorDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() category: string;
  @ApiProperty({ enum: ['INPUT', 'CALCULATED'] }) @IsEnum(['INPUT', 'CALCULATED']) type: string;
  @ApiProperty({ enum: ['CURRENCY','PERCENTAGE','NUMBER','DAYS','INDEX'] })
  @IsEnum(['CURRENCY','PERCENTAGE','NUMBER','DAYS','INDEX']) unit: string;
  @ApiProperty({ enum: ['DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY'] })
  @IsEnum(['DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY']) periodicity: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() responsible?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() sortOrder?: number;
}
