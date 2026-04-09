const { createClient } = require('@supabase/supabase-js')

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let supabaseAdmin = null

if (!url || !serviceKey) {
  console.error(
    '[server] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — set server/.env (see .env.example). /api/auth/* will return 503 until fixed.',
  )
} else {
  supabaseAdmin = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

module.exports = { supabaseAdmin }
