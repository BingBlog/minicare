/**
 * 调试脚本：手动测试完整 API 流程
 * 运行：node test/debug-api.mjs
 */
const BASE = 'http://localhost:3001';
const PHONE = '18899999901';

async function apiCall(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  // 1. 登录
  console.log('\n=== 1. 登录 ===');
  const s = await apiCall('/api/auth/send-code', { method: 'POST', body: JSON.stringify({ phone: PHONE }) });
  console.log('sendCode:', s.status, JSON.stringify(s.data));

  const v = await apiCall('/api/auth/verify-code', { method: 'POST', body: JSON.stringify({ phone: PHONE, code: '123456' }) });
  console.log('verifyCode:', v.status, v.data?.token?.slice(0, 20) + '...', '| userId:', v.data?.user?.id);
  const token = v.data.token;
  const headers = { Authorization: 'Bearer ' + token };

  // 2. 创建家庭
  console.log('\n=== 2. 创建家庭 ===');
  const f = await apiCall('/api/family', { method: 'POST', headers, body: JSON.stringify({ name: '调试家庭' }) });
  console.log('createFamily:', f.status, JSON.stringify(f.data));
  const familyId = f.data.id;

  // 3. 创建宝宝
  console.log('\n=== 3. 创建宝宝 ===');
  const b = await apiCall('/api/family/' + familyId + '/baby', {
    method: 'POST', headers,
    body: JSON.stringify({ name: '调试宝宝', gender: 'female', birth_date: '2024-06-15' })
  });
  console.log('createBaby:', b.status, JSON.stringify(b.data));
  const babyId = b.data.id;

  // 4. 创建饮食记录
  console.log('\n=== 4. 饮食记录（formula） ===');
  const feeding = await apiCall('/api/family/' + familyId + '/records/feeding', {
    method: 'POST', headers,
    body: JSON.stringify({ baby_id: babyId, feed_type: 'formula', record_time: new Date().toISOString(), formula_ml: 120 })
  });
  console.log('createFeeding:', feeding.status, JSON.stringify(feeding.data));

  // 5. 睡眠记录（startSleep）
  console.log('\n=== 5. 睡眠记录（start） ===');
  const sleep = await apiCall('/api/family/' + familyId + '/records/sleep/start', {
    method: 'POST', headers,
    body: JSON.stringify({ baby_id: babyId, start_time: new Date(Date.now() - 3600000).toISOString() })
  });
  console.log('startSleep:', sleep.status, JSON.stringify(sleep.data));

  // 6. 尿布记录
  console.log('\n=== 6. 尿布记录（dirty） ===');
  const diaper = await apiCall('/api/family/' + familyId + '/records/diaper', {
    method: 'POST', headers,
    body: JSON.stringify({ baby_id: babyId, diaper_type: 'dirty', record_time: new Date().toISOString(), color: 'yellow' })
  });
  console.log('createDiaper:', diaper.status, JSON.stringify(diaper.data));

  // 7. 医疗记录（checkup + 新字段）
  console.log('\n=== 7. 医疗记录（checkup） ===');
  const medical = await apiCall('/api/family/' + familyId + '/records/medical', {
    method: 'POST', headers,
    body: JSON.stringify({ baby_id: babyId, visit_date: '2026-04-01', visit_type: 'checkup', hospital: '测试医院', result_summary: '正常' })
  });
  console.log('createMedical:', medical.status, JSON.stringify(medical.data));
}

main().catch(console.error);