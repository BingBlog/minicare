import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export enum Mood { HAPPY = 'happy', CALM = 'calm', FUSSY = 'fussy', CRYING = 'crying' }

export class CreateHealthDto {
  @ApiProperty() @IsUUID() baby_id: string;
  @ApiProperty() @IsDateString() recorded_at: string;
  @ApiPropertyOptional({ description: '体温（℃），正常范围 35-42' })
  @IsOptional() @IsNumber() @Min(35) @Max(42) temperature_c?: number;
  @ApiPropertyOptional({ enum: Mood }) @IsOptional() @IsEnum(Mood) mood?: Mood;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
