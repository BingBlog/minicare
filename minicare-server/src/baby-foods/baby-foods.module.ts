import { Module } from '@nestjs/common';
import { BabyFoodsController } from './baby-foods.controller';

@Module({
  controllers: [BabyFoodsController],
})
export class BabyFoodsModule {}
