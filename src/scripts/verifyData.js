require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })
const { supabaseAdmin } = require('../config/supabase')

async function main() {
  const { count, error } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true })
  if (error) throw error
  console.log('profiles count:', count)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
