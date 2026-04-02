import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BABY_FOODS, FOOD_CATEGORIES, BabyFood } from './baby-foods.data';

@ApiTags('baby-foods')
@Controller('baby-foods')
export class BabyFoodsController {
  /**
   * 获取辅食列表（支持按名称搜索、按分类筛选）
   * GET /api/baby-foods?query=南瓜&category=vegetable
   */
  @Get()
  @ApiOperation({ summary: '获取婴儿辅食列表，支持关键字搜索' })
  @ApiQuery({ name: 'query', required: false, description: '名称关键字搜索' })
  @ApiQuery({ name: 'category', required: false, description: '分类筛选' })
  list(
    @Query('query') query?: string,
    @Query('category') category?: string,
  ): { items: BabyFood[]; categories: typeof FOOD_CATEGORIES } {
    let items = BABY_FOODS;

    if (category) {
      items = items.filter((f) => f.category === category);
    }

    if (query && query.trim()) {
      const keyword = query.trim().toLowerCase();
      items = items.filter((f) => f.name.toLowerCase().includes(keyword));
    }

    return { items, categories: FOOD_CATEGORIES };
  }
}
