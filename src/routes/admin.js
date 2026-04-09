const express = require('express')
const { authenticate, requireRole } = require('../middleware/auth')
const configService = require('../services/configService')
const manualPaymentService = require('../services/manualPaymentService')
const { supabaseAdmin } = require('../config/supabase')

const router = express.Router()
router.use(authenticate)
router.use(requireRole('admin'))

router.get('/subscription/config', async (req, res, next) => {
  try {
    const config = await configService.getConfig()
    res.json({ success: true, config })
  } catch (err) {
    next(err)
  }
})

router.put('/subscription/config', async (req, res, next) => {
  try {
    const newConfig = await configService.updateConfig(req.body)
    res.json({ success: true, config: newConfig })
  } catch (err) {
    next(err)
  }
})

router.get('/payments/manual', async (req, res, next) => {
  try {
    const payments = await manualPaymentService.listPendingPayments()
    res.json({ success: true, payments })
  } catch (err) {
    next(err)
  }
})

router.post('/payments/verify', async (req, res, next) => {
  try {
    const { paymentId, status } = req.body
    await manualPaymentService.verifyPayment(paymentId, status, req.user.uid)
    res.json({ success: true, message: `Payment ${status} successfully` })
  } catch (err) {
    next(err)
  }
})

router.get('/users', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, display_name, role, subscription, subscription_end_at, is_banned, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw error
    const users = (data || []).map((u) => ({
      uid: u.id,
      name: u.display_name,
      email: u.email,
      role: u.role,
      subscription: u.subscription,
      subscriptionEndDate: u.subscription_end_at,
      isBanned: u.is_banned,
      createdAt: u.created_at,
    }))
    res.json({ success: true, users })
  } catch (err) {
    next(err)
  }
})

router.put('/users/:uid', async (req, res, next) => {
  try {
    const { uid } = req.params
    const { role, subscription, subscriptionEndDate, isBanned } = req.body
    const patch = { updated_at: new Date().toISOString() }
    if (role !== undefined) patch.role = role
    if (subscription !== undefined) patch.subscription = subscription
    if (subscriptionEndDate !== undefined) patch.subscription_end_at = subscriptionEndDate
    if (isBanned !== undefined) patch.is_banned = isBanned

    const { error } = await supabaseAdmin.from('profiles').update(patch).eq('id', uid)
    if (error) throw error
    res.json({ success: true, message: 'ইউজারের তথ্য আপডেট করা হয়েছে' })
  } catch (err) {
    next(err)
  }
})

router.get('/stats', async (req, res, next) => {
  try {
    const [{ count: uCount }, { count: pCount }, { data: payRows }] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('papers').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('payments').select('amount, status'),
    ])

    let totalRevenue = 0
    ;(payRows || []).forEach((p) => {
      if (p.status === 'success' || p.status === 'verified') {
        totalRevenue += Number(p.amount) || 0
      }
    })

    res.json({
      success: true,
      totalUsers: uCount || 0,
      totalPapers: pCount || 0,
      totalPayments: (payRows || []).length,
      totalRevenue,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/payments/all', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    const payments = (data || []).map((p) => ({
      id: p.tran_id,
      ...p,
      userId: p.user_id,
    }))
    res.json({ success: true, payments })
  } catch (err) {
    next(err)
  }
})

module.exports = router
