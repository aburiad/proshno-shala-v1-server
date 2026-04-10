const { supabaseAdmin } = require('../config/supabase')
const { AppError } = require('./errorHandler')

async function authenticate(req, res, next) {
  console.log('[authMiddleware] Headers:', JSON.stringify(req.headers))
  
  if (!supabaseAdmin) {
    return next(new AppError('Server missing Supabase configuration', 503))
  }

  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    console.log('[authMiddleware] No Authorization header found')
    return next(new AppError('Authentication required', 401))
  }

  const token = header.split(' ')[1]
  console.log('[authMiddleware] Token received:', token?.substring(0, 20) + '...')
  
  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token)
  
  if (authErr || !authData?.user) {
    console.error('[authMiddleware] Supabase auth.getUser failed:', authErr?.message || 'No user data')
    return next(new AppError('Invalid or expired token', 401))
  }

  const user = authData.user
  let { data: profile, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (profErr) {
    console.error('[authMiddleware] Profile fetch failed for user', user.id, ':', profErr.message)
    return next(new AppError('Profile load failed', 500))
  }

  if (!profile) {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email || '',
        display_name:
          user.user_metadata?.name ||
          user.user_metadata?.full_name ||
          (user.email ? user.email.split('@')[0] : 'User'),
        auth_provider: user.app_metadata?.provider || 'email',
      })
      .select()
      .single()
    if (insErr) {
      return next(new AppError('Could not create profile', 500))
    }
    profile = inserted
  }

  if (profile.is_banned) {
    return next(new AppError('আপনার অ্যাকাউন্টটি ব্যান করা হয়েছে।', 403))
  }

  req.authUser = user
  req.profile = profile
  req.user = {
    uid: user.id,
    email: profile.email || user.email,
    role: profile.role,
    subscription: profile.subscription || 'free',
    subscriptionEndDate: profile.subscription_end_at,
  }

  next()
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role || !roles.includes(req.user.role)) {
      return next(new AppError('Access denied', 403))
    }
    next()
  }
}

function requirePro(req, res, next) {
  if (!req.user || req.user.subscription !== 'pro') {
    return next(new AppError('Pro subscription required', 403))
  }
  next()
}

module.exports = { authenticate, requireRole, requirePro }
