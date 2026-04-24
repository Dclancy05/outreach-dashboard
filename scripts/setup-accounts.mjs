import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROXY_PASSWORD = process.env.IPROYAL_PROXY_PASSWORD

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment')
  process.exit(1)
}
if (!PROXY_PASSWORD) {
  console.error('Missing IPROYAL_PROXY_PASSWORD in environment')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const today = new Date().toISOString().split('T')[0]

// Parse FB accounts from order7885288.txt (first 10)
const fbLines = readFileSync('/home/clawd/.openclaw/workspace/accounts/order7885288.txt', 'utf-8').trim().split('\n').slice(0, 10)

const proxyBase = 'brd-customer-hl_842ea05e-zone-isp'

const accounts = []

// 10 Facebook accounts
fbLines.forEach((line, i) => {
  const parts = line.split(':')
  // format: username:password:2FA:email:emailpass:cookie:orderid
  const username = parts[0]
  const password = parts[1]
  const twoFA = parts[2]
  const email = parts[3]
  const emailPass = parts[4]
  const cookie = parts[5]

  accounts.push({
    username,
    password,
    email,
    email_password: emailPass,
    platform: 'facebook',
    identity_group: i + 1,
    two_factor_secret: twoFA,
    cookie: cookie || '',
    status: 'warming',
    daily_limit: '5',
    sends_today: '0',
    warmup_start_date: today,
    warmup_day: 1,
    proxy_host: 'brd.superproxy.io',
    proxy_port: '22225',
    proxy_username: `${proxyBase}-ip-${String(i + 1).padStart(2, '0')}`,
    proxy_password: PROXY_PASSWORD,
    notes: `FB account from order7885288, proxy #${i + 1}`,
  })
})

// 10 Instagram placeholders
for (let i = 0; i < 10; i++) {
  accounts.push({
    username: `ig_placeholder_${i + 1}`,
    password: '',
    email: '',
    email_password: '',
    platform: 'instagram',
    identity_group: i + 1,
    two_factor_secret: '',
    cookie: '',
    status: 'paused',
    daily_limit: '5',
    sends_today: '0',
    warmup_start_date: today,
    warmup_day: 1,
    proxy_host: 'brd.superproxy.io',
    proxy_port: '22225',
    proxy_username: `${proxyBase}-ip-${String(i + 1).padStart(2, '0')}`,
    proxy_password: PROXY_PASSWORD,
    notes: 'Placeholder - needs IG account purchase. Change status to warming once set up.',
  })
}

// 10 LinkedIn placeholders
for (let i = 0; i < 10; i++) {
  accounts.push({
    username: `li_placeholder_${i + 1}`,
    password: '',
    email: '',
    email_password: '',
    platform: 'linkedin',
    identity_group: i + 1,
    two_factor_secret: '',
    cookie: '',
    status: 'paused',
    daily_limit: '5',
    sends_today: '0',
    warmup_start_date: today,
    warmup_day: 1,
    proxy_host: 'brd.superproxy.io',
    proxy_port: '22225',
    proxy_username: `${proxyBase}-ip-${String(i + 1).padStart(2, '0')}`,
    proxy_password: PROXY_PASSWORD,
    notes: 'Placeholder - needs LI account purchase. Change status to warming once set up.',
  })
}

console.log(`Inserting ${accounts.length} accounts...`)

const { data, error } = await supabase.from('outreach_accounts').insert(accounts).select('account_id, username, platform, status')

if (error) {
  console.error('Error:', error.message)
  process.exit(1)
}

console.log(`Inserted ${data.length} accounts:`)
data.forEach(a => console.log(`  ${a.platform} | ${a.username} | ${a.status}`))
