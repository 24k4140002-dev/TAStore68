/**
 * MetaPost Studio — Supabase Database Auto-Setup
 * Kết nối trực tiếp PostgreSQL và chạy toàn bộ schema
 */
const { Client } = require('pg');

const DB_PASSWORD = '?Na9B6$pKhsJze!';
const PROJECT_REF = 'svhrdnugpjocumycqddm';

const CONFIGS = [
  {
    label: 'Session Pooler (Singapore :5432)',
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: `postgres.${PROJECT_REF}`,
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000
  },
  {
    label: 'Transaction Pooler (Singapore :6543)',
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: `postgres.${PROJECT_REF}`,
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000
  },
  {
    label: 'Direct DB (supabase.co :5432)',
    host: `db.${PROJECT_REF}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000
  },
  {
    label: 'Direct DB (supabase.co :6543)',
    host: `db.${PROJECT_REF}.supabase.co`,
    port: 6543,
    database: 'postgres',
    user: 'postgres',
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000
  }
];

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', C = '\x1b[36m', B = '\x1b[1m', X = '\x1b[0m';
const ok   = m => console.log(`${G}  ✅ ${m}${X}`);
const fail = m => console.log(`${R}  ❌ ${m}${X}`);
const info = m => console.log(`${C}  ▶  ${m}${X}`);
const warn = m => console.log(`${Y}  ⚠  ${m}${X}`);
const head = m => console.log(`\n${B}${C}${m}${X}`);

async function runSQL(client, label, sql) {
  process.stdout.write(`  ${label}... `);
  try {
    await client.query(sql);
    console.log(`${G}✅${X}`);
    return true;
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log(`${Y}⚠ đã tồn tại${X}`);
      return true;
    }
    console.log(`${R}❌ ${e.message.split('\n')[0]}${X}`);
    return false;
  }
}

async function main() {
  head('==============================================');
  head('  MetaPost Studio — Supabase Database Setup  ');
  head(`  Project: ${PROJECT_REF}                    `);
  head('==============================================');

  // ── Connect: thử lần lượt tất cả endpoints ─────────────
  let client = null;
  for (const cfg of CONFIGS) {
    info(`Thử: ${cfg.label}`);
    const c = new Client(cfg);
    try {
      await c.connect();
      ok(`Kết nối thành công!`);
      client = c;
      break;
    } catch (e) {
      fail(`${e.message.substring(0, 90)}`);
      await c.end().catch(() => {});
    }
  }

  if (!client) {
    fail('Không thể kết nối PostgreSQL!');
    console.log(`\n${Y}  Supabase có thể chặn IP. Cách thay thế:\n`);
    console.log(`  1. Vào: https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
    console.log(`  2. Paste nội dung file db-setup.sql`);
    console.log(`  3. Bấm RUN${X}\n`);
    process.exit(1);
  }

  // ── Create Tables ───────────────────────────────────────
  head('\n📋 Tạo Tables...');

  await runSQL(client, 'Extension pgcrypto',
    `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

  await runSQL(client, 'Bảng campaigns',
    `CREATE TABLE IF NOT EXISTS campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL, ad_id TEXT,
      source TEXT DEFAULT 'ADS', description TEXT,
      status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT now()
    );`);

  await runSQL(client, 'Bảng customers',
    `CREATE TABLE IF NOT EXISTS customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      psid TEXT UNIQUE NOT NULL, page_id TEXT NOT NULL,
      first_name TEXT, last_name TEXT, profile_pic TEXT,
      phone TEXT, email TEXT, locale TEXT,
      source TEXT DEFAULT 'organic', ad_id TEXT,
      campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
      notes_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );`);

  await runSQL(client, 'Bảng conversations',
    `CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fb_conversation_id TEXT UNIQUE NOT NULL,
      customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
      campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
      page_id TEXT NOT NULL, page_name TEXT,
      conversation_type TEXT DEFAULT 'messenger',
      snippet TEXT, unread_count INT DEFAULT 0,
      status TEXT DEFAULT 'open', can_reply BOOLEAN DEFAULT true,
      reply_deadline TIMESTAMPTZ,
      last_message_at TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );`);

  await runSQL(client, 'Bảng messages',
    `CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
      fb_message_id TEXT UNIQUE NOT NULL,
      sender_type TEXT NOT NULL, sender_id TEXT NOT NULL,
      sender_name TEXT, message_text TEXT,
      attachments JSONB DEFAULT '[]'::jsonb,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now()
    );`);

  await runSQL(client, 'Bảng labels',
    `CREATE TABLE IF NOT EXISTS labels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE, color TEXT DEFAULT '#3B82F6',
      emoji TEXT DEFAULT '🏷️', sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );`);

  await runSQL(client, 'Bảng conversation_labels',
    `CREATE TABLE IF NOT EXISTS conversation_labels (
      conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
      label_id UUID REFERENCES labels(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (conversation_id, label_id)
    );`);

  await runSQL(client, 'Bảng tags',
    `CREATE TABLE IF NOT EXISTS tags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE, color TEXT DEFAULT '#10B981',
      created_at TIMESTAMPTZ DEFAULT now()
    );`);

  await runSQL(client, 'Bảng customer_tags',
    `CREATE TABLE IF NOT EXISTS customer_tags (
      customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
      tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (customer_id, tag_id)
    );`);

  await runSQL(client, 'Bảng notes',
    `CREATE TABLE IF NOT EXISTS notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
      conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
      author_name TEXT NOT NULL DEFAULT 'Admin',
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );`);

  // ── Indexes ─────────────────────────────────────────────
  head('\n📊 Tạo Indexes...');
  await runSQL(client, 'idx_customers_psid',       `CREATE INDEX IF NOT EXISTS idx_customers_psid ON customers(psid);`);
  await runSQL(client, 'idx_conversations_status', `CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);`);
  await runSQL(client, 'idx_conversations_page',   `CREATE INDEX IF NOT EXISTS idx_conversations_page ON conversations(page_id);`);
  await runSQL(client, 'idx_conversations_last',   `CREATE INDEX IF NOT EXISTS idx_conversations_last ON conversations(last_message_at DESC);`);
  await runSQL(client, 'idx_messages_conv',        `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at ASC);`);
  await runSQL(client, 'idx_notes_customer',       `CREATE INDEX IF NOT EXISTS idx_notes_customer ON notes(customer_id);`);

  // ── Seed Labels ─────────────────────────────────────────
  head('\n🏷️  Labels mặc định...');
  const labels = [
    ['Tiềm năng',     '#F59E0B', '🌟', 1],
    ['Đã chốt đơn',   '#10B981', '✅', 2],
    ['Cần follow-up', '#3B82F6', '🔔', 3],
    ['Khách VIP',     '#8B5CF6', '👑', 4],
    ['Đang xử lý',   '#F97316', '⚙️', 5],
    ['Đã huỷ đơn',   '#EF4444', '❌', 6],
    ['Hỏi thêm',     '#64748B', '💬', 7],
  ];
  for (const [name, color, emoji, sort] of labels) {
    await runSQL(client, `${emoji} ${name}`,
      `INSERT INTO labels (name,color,emoji,sort_order) VALUES ('${name}','${color}','${emoji}',${sort}) ON CONFLICT (name) DO NOTHING;`);
  }

  // ── Seed Tags ────────────────────────────────────────────
  head('\n🔖 Tags mặc định...');
  const tags = [
    ['Sản phẩm mới', '#06B6D4'],
    ['Khuyến mãi',   '#F59E0B'],
    ['Quảng cáo',    '#8B5CF6'],
    ['Organic',      '#10B981'],
    ['Tái mua',      '#3B82F6'],
  ];
  for (const [name, color] of tags) {
    await runSQL(client, `# ${name}`,
      `INSERT INTO tags (name,color) VALUES ('${name}','${color}') ON CONFLICT (name) DO NOTHING;`);
  }

  // ── Verify ───────────────────────────────────────────────
  head('\n🔍 Kiểm tra tổng thể...');
  const tables = ['campaigns','customers','conversations','messages','labels','conversation_labels','tags','customer_tags','notes'];
  let allOk = true;
  for (const t of tables) {
    try {
      const r = await client.query(`SELECT COUNT(*) as c FROM ${t};`);
      ok(`${t}: ${r.rows[0].c} rows`);
    } catch (e) {
      fail(`${t}: THIẾU! ${e.message}`);
      allOk = false;
    }
  }

  await client.end();

  if (allOk) {
    head('\n==============================================');
    console.log(`${G}${B}  🎉 SETUP DATABASE HOÀN THÀNH 100%!${X}`);
    head('==============================================');
    console.log(`\n${C}  👉 Mở CRM Inbox: http://localhost:3000/inbox.html${X}`);
    console.log(`${C}  👉 MetaPost Studio: http://localhost:3000${X}\n`);
  } else {
    warn('\nMột số bảng chưa được tạo. Chạy lại hoặc dùng db-setup.sql thủ công.');
  }
}

main().catch(e => {
  console.error(`\n${R}Lỗi nghiêm trọng: ${e.message}${X}`);
  process.exit(1);
});
