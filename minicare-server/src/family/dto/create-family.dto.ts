import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFamilyDto {
  @ApiProperty({ example: '小明一家', description: '家庭名称（2-20字）' })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  name: string;
}
