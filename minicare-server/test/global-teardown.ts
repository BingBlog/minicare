/**
 * Jest globalTeardown — 测试后清理测试数据
 *
 * 通过直连 MySQL 删除测试手机号相关的所有数据
 * 需要 DB_* 环境变量（与 .env.local 相同）
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env.local') });

export default async function globalTeardown() {
  const mysql2 = await import('mysql2/promise');
  const pool = mysql2.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'minicare_dev',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'minicare123',
  });

  const TEST_PHONES = ['18811111101', '18811111102'];

  try {
    for (const phone of TEST_PHONES) {
      // 找到用户 ID
      const [users] = await pool.execute<any[]>(
        'SELECT id FROM user_account WHERE phone = ?',
        [phone],
      );
      if (users.length === 0) continue;
      const userId = users[0].id;

      // 找到用户的家庭成员记录
      const [memberRows] = await pool.execute<any[]>(
        'SELECT family_id FROM family_member WHERE user_id = ?',
        [userId],
      );

      for (const row of memberRows) {
        const familyId = row.family_id;

        // 找宝宝
        const [babyRows] = await pool.execute<any[]>(
          'SELECT id FROM baby_profile WHERE family_id = ?',
          [familyId],
        );
        for (const baby of babyRows) {
          const babyId = baby.id;
          // 删除所有记录
          for (const table of [
            'feeding_record', 'sleep_record', 'diaper_record',
            'activity_record', 'health_record', 'symptom_record',
            'growth_record', 'medical_record',
          ]) {
            await pool.execute(`DELETE FROM ${table} WHERE baby_id = ?`, [babyId]);
          }
        }
        // 删除宝宝档案
        await pool.execute('DELETE FROM baby_profile WHERE family_id = ?', [familyId]);
        // 删除家庭成员
        await pool.execute('DELETE FROM family_member WHERE family_id = ?', [familyId]);
        // 删除家庭
        await pool.execute('DELETE FROM family_group WHERE id = ?', [familyId]);
      }

      // 删除用户
      await pool.execute('DELETE FROM user_account WHERE id = ?', [userId]);
    }
    console.log('\n[E2E] 测试数据清理完成');
  } catch (err) {
    console.warn('[E2E] 清理测试数据时出错（可忽略）:', (err as Error).message);
  } finally {
    await pool.end();
  }
}