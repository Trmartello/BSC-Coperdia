import { IsString, IsDateString, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateForecastDto {
  @ApiProperty() @IsString() indicatorId: string;
  @ApiProperty() @IsString() scenarioId: string;
  @ApiProperty() @IsDateString() period: string;
  @ApiProperty() @IsNumber() value: number;
}
