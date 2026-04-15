import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const supabase = createClient(
  'https://yfufocegjhxxffqtkvkr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmdWZvY2Vnamh4eGZmcXRrdmtyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTI5MjI4NiwiZXhwIjoyMDg0ODY4Mjg2fQ.KW316doByafkbM9hZyWgPj4fho5NY1p4RBuUN0MTrNA'
)

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
    proxy_password: '4tv2tjpt6ppq',
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
    proxy_password: '4tv2tjpt6ppq',
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
    proxy_password: '4tv2tjpt6ppq',
    notes: 'Placeholder - needs LI account purchase. Change status to warming once set up.',
  })
}

console.log(`Inserting ${accounts.length} accounts...`)

const { data, error } = await supabase.from('outreach_accounts').insert(accounts).select('account_id, username, platform, status')

if (error) {
  console.error('Error:', error.message)
  process.exit(1)
}

console.log(`✅ Inserted ${data.length} accounts:`)
data.forEach(a => console.log(`  ${a.platform} | ${a.username} | ${a.status}`))
