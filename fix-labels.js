// Fix labels with proper Vietnamese UTF-8 via Node.js HTTPS
const https = require('https');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2aHJkbnVncGpvY3VteWNxZGRtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njk1NzMwNiwiZXhwIjoyMTAyNTMzMzA2fQ.ru8rFuPJzNWyZkLvrELNYzv-Wtx5S2tNaFcK_BXCfjM';
const HOST = 'svhrdnugpjocumycqddm.supabase.co';

function req(method, path, data) {
  return new Promise((resolve, reject) => {
    const body = data ? Buffer.from(JSON.stringify(data), 'utf8') : null;
    const opts = {
      hostname: HOST, port: 443, path, method,
      headers: {
        'apikey': TOKEN,
        'Authorization': 'Bearer ' + TOKEN,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
        ...(body ? { 'Content-Length': body.length } : {})
      }
    };
    const r = https.request(opts, res => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

async function main() {
  console.log('🔧 Fixing labels with proper Vietnamese UTF-8...\n');

  // Delete all existing labels (cascade will handle conversation_labels)
  let res = await req('DELETE', '/rest/v1/labels?id=neq.00000000-0000-0000-0000-000000000000');
  console.log('Delete labels:', res.status < 300 ? '✅ OK' : '❌ ' + res.body);

  res = await req('DELETE', '/rest/v1/tags?id=neq.00000000-0000-0000-0000-000000000000');
  console.log('Delete tags:  ', res.status < 300 ? '✅ OK' : '❌ ' + res.body);

  // Insert labels with proper Vietnamese
  const labels = [
    { name: 'Tiềm năng',     color: '#F59E0B', emoji: '⭐', sort_order: 1 },
    { name: 'Đã chốt đơn',   color: '#10B981', emoji: '✅', sort_order: 2 },
    { name: 'Cần follow-up', color: '#3B82F6', emoji: '🔔', sort_order: 3 },
    { name: 'Khách VIP',     color: '#8B5CF6', emoji: '👑', sort_order: 4 },
    { name: 'Đang xử lý',   color: '#F97316', emoji: '⚙', sort_order: 5 },
    { name: 'Đã huỷ đơn',   color: '#EF4444', emoji: '❌', sort_order: 6 },
    { name: 'Hỏi thêm',     color: '#64748B', emoji: '💬', sort_order: 7 },
  ];

  const tags = [
    { name: 'Sản phẩm mới', color: '#06B6D4' },
    { name: 'Khuyến mãi',   color: '#F59E0B' },
    { name: 'Quảng cáo',    color: '#8B5CF6' },
    { name: 'Organic',      color: '#10B981' },
    { name: 'Tái mua',      color: '#3B82F6' },
  ];

  res = await req('POST', '/rest/v1/labels', labels);
  console.log('Insert labels:', res.status < 300 ? '✅ OK' : '❌ ' + res.body);

  res = await req('POST', '/rest/v1/tags', tags);
  console.log('Insert tags:  ', res.status < 300 ? '✅ OK' : '❌ ' + res.body);

  // Verify what's stored
  console.log('\n📋 Verifying stored data...');
  const verRes = await req('GET', '/rest/v1/labels?select=name,emoji,color&order=sort_order');
  const stored = JSON.parse(verRes.body);
  stored.forEach(l => console.log(`  ${l.emoji} ${l.name} [${l.color}]`));

  console.log('\n✅ Done! Reload CRM Inbox to see proper Vietnamese labels.');
}

main().catch(console.error);
