-- ============================================================
-- METAPOST STUDIO — CRM Inbox Database Schema
-- Run this entire script in Supabase SQL Editor
-- Project Settings → SQL Editor → Paste & Run
-- ============================================================

-- Enable UUID extension (usually enabled by default)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. CAMPAIGNS — Track Ads vs Organic sources
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    ad_id       TEXT,
    source      TEXT DEFAULT 'ADS' CHECK (source IN ('ADS', 'ORGANIC', 'SHORTLINK', 'OTHER')),
    description TEXT,
    status      TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. CUSTOMERS — Lead & Contact Profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    psid        TEXT UNIQUE NOT NULL,
    page_id     TEXT NOT NULL,
    first_name  TEXT,
    last_name   TEXT,
    profile_pic TEXT,
    phone       TEXT,
    email       TEXT,
    locale      TEXT,
    source      TEXT DEFAULT 'organic',
    ad_id       TEXT,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    notes_count INT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. CONVERSATIONS — Inbox Threads (Messenger + Comments)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fb_conversation_id  TEXT UNIQUE NOT NULL,
    customer_id         UUID REFERENCES customers(id) ON DELETE CASCADE,
    campaign_id         UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    page_id             TEXT NOT NULL,
    page_name           TEXT,
    conversation_type   TEXT DEFAULT 'messenger' CHECK (conversation_type IN ('messenger', 'comment')),
    snippet             TEXT,
    unread_count        INT DEFAULT 0,
    status              TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'pending', 'snoozed')),
    can_reply           BOOLEAN DEFAULT true,
    reply_deadline      TIMESTAMPTZ,
    last_message_at     TIMESTAMPTZ DEFAULT now(),
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. MESSAGES — Cached Message History
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    fb_message_id   TEXT UNIQUE NOT NULL,
    sender_type     TEXT NOT NULL CHECK (sender_type IN ('customer', 'page', 'system')),
    sender_id       TEXT NOT NULL,
    sender_name     TEXT,
    message_text    TEXT,
    attachments     JSONB DEFAULT '[]'::jsonb,
    is_read         BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. LABELS — Thread Status Labels (with color coding)
-- ============================================================
CREATE TABLE IF NOT EXISTS labels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    color       TEXT DEFAULT '#3B82F6',
    emoji       TEXT DEFAULT '🏷️',
    sort_order  INT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_labels (
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    label_id        UUID REFERENCES labels(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (conversation_id, label_id)
);

-- ============================================================
-- 6. TAGS — Customer Segmentation Tags
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    color       TEXT DEFAULT '#10B981',
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_tags (
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    tag_id      UUID REFERENCES tags(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (customer_id, tag_id)
);

-- ============================================================
-- 7. NOTES — Internal CRM Notes (not visible to customers)
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    author_name     TEXT NOT NULL DEFAULT 'Admin',
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 8. INDEXES — For Performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_customers_psid        ON customers(psid);
CREATE INDEX IF NOT EXISTS idx_customers_page        ON customers(page_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status  ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_page    ON conversations(page_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last    ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv         ON messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_notes_customer        ON notes(customer_id);

-- ============================================================
-- 9. DEFAULT LABELS — Seed Data
-- ============================================================
INSERT INTO labels (name, color, emoji, sort_order) VALUES
    ('Tiềm năng',       '#F59E0B', '🌟', 1),
    ('Đã chốt đơn',     '#10B981', '✅', 2),
    ('Cần follow-up',   '#3B82F6', '🔔', 3),
    ('Khách VIP',       '#8B5CF6', '👑', 4),
    ('Đang xử lý',      '#F97316', '⚙️', 5),
    ('Đã huỷ đơn',      '#EF4444', '❌', 6),
    ('Hỏi thêm',        '#64748B', '💬', 7)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 10. DEFAULT TAGS — Seed Data
-- ============================================================
INSERT INTO tags (name, color) VALUES
    ('Sản phẩm mới',  '#06B6D4'),
    ('Khuyến mãi',    '#F59E0B'),
    ('Quảng cáo',     '#8B5CF6'),
    ('Organic',       '#10B981'),
    ('Tái mua',       '#3B82F6')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated and anon access" ON campaigns FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access" ON customers FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access" ON conversations FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access" ON messages FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access" ON labels FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access" ON conversation_labels FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access" ON tags FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access" ON customer_tags FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access" ON notes FOR ALL USING (true);

-- ============================================================
-- ✅ DONE! Schema setup with RLS complete.
-- ============================================================
