/**
 * 调试 feeding 接口 500 错误
 * 直接用 Node.js 调用数据库，模拟 feeding.service.ts 的逻辑
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const mysql2 = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

// 日期转换工具（与 src/common/utils/date.util.ts 相同）
function toMysqlDatetime(isoString) {
  const date = typeof isoString === 'string' ? new Date(isoString) : isoString;
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

async function main() {
  const pool = await mysql2.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'minicare_dev',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'minicare123',
  });

  try {
    const id = uuidv4();
    const babyId = '048e233c-3c5c-4c20-aa73-2eb3ba5dc208';
    const userId = 'f1b3a5ef-9b6f-482d-806f-ffb2b6d3a535';

    console.log('Testing INSERT with toMysqlDatetime conversion...');
    const [result] = await pool.execute(
      `INSERT INTO feeding_record
         (id, baby_id, recorded_by, record_time, feed_type,
          breast_side, duration_min, formula_ml,
          complementary_food, amount_g, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        babyId,
        userId,
        toMysqlDatetime('2026-04-01T08:00:00.000Z'),  // 转换为 MySQL 格式
        2,    // FEED_TYPE_TO_INT['formula'] = 2
        null, // breast_side
        null, // duration_min
        120,  // formula_ml
        null, // complementary_food
        null, // amount_g
        'AA3勺', // note
      ]
    );
    console.log('INSERT OK:', result.affectedRows, 'rows. id =', id);

    // 查询验证
    const [rows] = await pool.execute('SELECT * FROM feeding_record WHERE id = ?', [id]);
    console.log('SELECT OK:', JSON.stringify(rows[0]));

    // 清理
    await pool.execute('DELETE FROM feeding_record WHERE id = ?', [id]);
    console.log('DELETE OK');

  } catch (err) {
    console.error('ERROR:', err.message);
    console.error('CODE:', err.code);
    console.error('SQL STATE:', err.sqlState);
  } finally {
    await pool.end();
  }
}

main();