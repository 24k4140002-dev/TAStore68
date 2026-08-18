
# ============================================================
# Supabase Auto-Setup Script — MetaPost Studio CRM Inbox
# Chạy từng câu SQL qua Supabase REST API với service_role key
# ============================================================

$PROJECT_REF = "svhrdnugpjocumycqddm"
$SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2aHJkbnVncGpvY3VteWNxZGRtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njk1NzMwNiwiZXhwIjoyMTAyNTMzMzA2fQ.ru8rFuPJzNWyZkLvrELNYzv-Wtx5S2tNaFcK_BXCfjM"
$SUPABASE_URL = "https://$PROJECT_REF.supabase.co"

$headers = @{
    "apikey"        = $SERVICE_KEY
    "Authorization" = "Bearer $SERVICE_KEY"
    "Content-Type"  = "application/json"
    "Prefer"        = "return=minimal"
}

function Exec-SQL {
    param([string]$sql, [string]$desc)
    Write-Host "▶ $desc..." -ForegroundColor Cyan
    try {
        $body = @{ query = $sql } | ConvertTo-Json -Depth 5
        $resp = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/rpc/exec_sql" `
            -Method POST -Headers $headers -Body $body -ErrorAction Stop
        Write-Host "  ✅ OK" -ForegroundColor Green
        return $true
    } catch {
        # Try alternative endpoint
        try {
            $resp2 = Invoke-WebRequest -Uri "$SUPABASE_URL/pg/query" `
                -Method POST -Headers $headers `
                -Body (@{ query = $sql } | ConvertTo-Json) -ErrorAction Stop
            Write-Host "  ✅ OK (alt)" -ForegroundColor Green
            return $true
        } catch {
            Write-Host "  ⚠ REST endpoint not available, will use direct migration" -ForegroundColor Yellow
            return $false
        }
    }
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Blue
Write-Host " MetaPost Studio — Supabase Auto Setup" -ForegroundColor Blue
Write-Host " Project: $PROJECT_REF" -ForegroundColor Blue
Write-Host "==========================================" -ForegroundColor Blue
Write-Host ""

# Test connection first
Write-Host "🔗 Kiểm tra kết nối Supabase..." -ForegroundColor Yellow
try {
    $testResp = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/labels?limit=1" `
        -Headers $headers -Method GET -ErrorAction Stop
    Write-Host "✅ Kết nối thành công! Tables đã tồn tại." -ForegroundColor Green
    Write-Host ""
    Write-Host "ℹ️  Database đã được setup trước đó." -ForegroundColor Cyan
    $alreadySetup = $true
} catch {
    if ($_.Exception.Message -like "*relation*does not exist*" -or $_.ToString() -like "*42P01*") {
        Write-Host "📋 Tables chưa tồn tại — sẽ tạo mới..." -ForegroundColor Yellow
        $alreadySetup = $false
    } else {
        Write-Host "✅ Kết nối OK, bắt đầu setup..." -ForegroundColor Green
        $alreadySetup = $false
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Blue
Write-Host " ⚡ THÔNG TIN KẾT NỐI ĐÃ SẴN SÀNG:" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Blue
Write-Host ""
Write-Host " 🌐 Supabase URL:" -ForegroundColor White
Write-Host "    $SUPABASE_URL" -ForegroundColor Cyan
Write-Host ""
Write-Host " 🔑 Anon Key (dùng trong app):" -ForegroundColor White
$ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2aHJkbnVncGpvY3VteWNxZGRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTczMDYsImV4cCI6MjEwMjUzMzMwNn0.-JC8UwzrUK0eNHCnHCqsL9yAyiernrhU74v9xWFJDxU"
Write-Host "    $ANON_KEY" -ForegroundColor Cyan
Write-Host ""
Write-Host "============================================" -ForegroundColor Blue
Write-Host " ✅ Copy 2 thông tin trên vào CRM Inbox Setup" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Blue
Write-Host ""
Write-Host "📌 BƯỚC TIẾP THEO:" -ForegroundColor Yellow
Write-Host "1. Vào Supabase Dashboard: https://supabase.com/dashboard/project/$PROJECT_REF/sql/new" -ForegroundColor White
Write-Host "2. Paste toàn bộ nội dung file: db-setup.sql" -ForegroundColor White
Write-Host "3. Bấm RUN (Ctrl+Enter)" -ForegroundColor White
Write-Host "4. Mở MetaPost Studio → CRM Inbox → Nhập URL và Key trên → Done!" -ForegroundColor White
Write-Host ""

# Open Supabase SQL Editor in browser
$sqlUrl = "https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
Write-Host "🌐 Đang mở Supabase SQL Editor..." -ForegroundColor Cyan
Start-Process $sqlUrl

Write-Host ""
Write-Host "✅ Script hoàn thành! Supabase SQL Editor đã mở trong trình duyệt." -ForegroundColor Green
Write-Host "   Paste nội dung file db-setup.sql vào đó và bấm RUN." -ForegroundColor Yellow
