const express = require('express')
const { authenticate } = require('../middleware/auth')
const { supabaseAdmin } = require('../config/supabase')
const { AppError } = require('../middleware/errorHandler')

const router = express.Router()

function profileToUser(profile) {
  return {
    uid: profile.id,
    name: profile.display_name,
    email: profile.email,
    role: profile.role,
    subscription: profile.subscription || 'free',
  }
}

router.put('/set-role', authenticate, async (req, res, next) => {
  try {
    const { role } = req.body
    const validRoles = ['school', 'coaching', 'admission', 'private_tutor']
    if (!validRoles.includes(role)) {
      throw new AppError('Invalid role', 400)
    }

    const { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', req.user.uid)
      .select()
      .single()
    if (error) throw error
    if (!updated) throw new AppError('User not found', 404)

    res.json({ user: profileToUser(updated) })
  } catch (err) {
    next(err)
  }
})

router.get('/me', authenticate, async (req, res, next) => {
  try {
    let subscription = req.profile.subscription
    if (subscription === 'pro' && req.profile.subscription_end_at) {
      if (new Date(req.profile.subscription_end_at) < new Date()) {
        subscription = 'free'
        await supabaseAdmin
          .from('profiles')
          .update({ subscription: 'free', updated_at: new Date().toISOString() })
          .eq('id', req.user.uid)
      }
    }

    res.json({
      success: true,
      user: {
        uid: req.profile.id,
        name: req.profile.display_name,
        email: req.profile.email,
        role: req.profile.role,
        subscription,
      },
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router
