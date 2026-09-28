import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class LinkObservationDto {
  @ApiProperty()
  @IsUUID()
  observation_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  food_name_snapshot?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  sync_status?: boolean;

  @ApiPropertyOptional({ enum: ['suspected', 'allergic'] })
  @IsOptional()
  @IsIn(['suspected', 'allergic'])
  target_status?: 'suspected' | 'allergic';
}
