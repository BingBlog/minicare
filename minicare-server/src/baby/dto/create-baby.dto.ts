import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export enum BabyGender {
  MALE   = 'male',
  FEMALE = 'female',
  OTHER  = 'other',
}

export class CreateBabyDto {
  @ApiProperty({ example: '小宝', description: '宝宝昵称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  name: string;

  @ApiProperty({ example: '2024-06-01', description: '出生日期（YYYY-MM-DD）' })
  @IsDateString()
  birth_date: string;

  @ApiProperty({ enum: BabyGender, example: BabyGender.MALE })
  @IsEnum(BabyGender)
  gender: BabyGender;

  @ApiPropertyOptional({ example: 3200, description: '出生体重（克）' })
  @IsOptional()
  birth_weight_g?: number;

  @ApiPropertyOptional({ example: 50, description: '出生身高（厘米）' })
  @IsOptional()
  birth_height_cm?: number;
}
