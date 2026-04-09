const express = require('express')
const router = express.Router()
const paymentService = require('../services/paymentService')
const manualPaymentService = require('../services/manualPaymentService')
const configService = require('../services/configService')
const { authenticate } = require('../middleware/auth')
const { AppError } = require('../middleware/errorHandler')

/**
 * GET /api/payment/config — Fetch public subscription settings (Price, features)
 */
router.get('/config', async (req, res, next) => {
  try {
    const config = await configService.getConfig()
    // Strip sensitive info like manual numbers if needed, but here they are needed for the UI
    res.json({ success: true, config })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/payment/init — Start SSLCommerz payment process
 */
router.post('/init', authenticate, async (req, res, next) => {
  try {
    const { planId } = req.body
    const config = await configService.getConfig()
    
    if (planId !== 'pro_monthly') {
      throw new AppError('Invalid plan selected', 400)
    }

    const plan = { 
      id: 'pro_monthly', 
      name: 'QGen Pro - 1 Month', 
      price: config.proPrice 
    }

    const paymentUrl = await paymentService.initPayment(req.user.uid, plan.price, plan)
    res.json({ success: true, url: paymentUrl })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/payment/manual — User submits a manual transaction ID
 */
router.post('/manual', authenticate, async (req, res, next) => {
  try {
    const { amount, method, tranId, phone } = req.body
    const payment = await manualPaymentService.submitManualPayment(req.user.uid, {
      amount, method, tranId, phone, email: req.user.email
    })
    res.json({ success: true, message: 'আপনার পেমেন্ট রিকোয়েস্ট পাঠানো হয়েছে। ভেরিফিকেশন এর জন্য অপেক্ষা করুন।', payment })
  } catch (err) {
    next(err)
  }
})

/**
 * Success/Fail/Cancel/IPN routes (same as before)
 */
router.all('/success', async (req, res, next) => {
  try {
    const tran_id = req.query?.tran_id || req.body?.tran_id
    const val_id = req.query?.val_id || req.body?.val_id || 'DEMO_VAL_ID'
    
    if (!tran_id) throw new AppError('Transaction ID missing', 400)

    await paymentService.completePayment(tran_id, val_id)
    res.redirect(`${process.env.FRONTEND_URL}/payment/success?tran_id=${tran_id}`)
  } catch (err) {
    next(err)
  }
})

router.all('/fail', (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL}/payment/fail`)
})

router.all('/cancel', (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL}/payment/fail`)
})

router.post('/ipn', async (req, res, next) => {
  try {
    const { tran_id, val_id, status } = req.body
    if (status === 'VALID' || status === 'AUTHENTICATED') {
      await paymentService.completePayment(tran_id, val_id)
    }
    res.status(200).send('OK')
  } catch (err) {
    console.error('IPN Error:', err.message)
    res.status(200).send('Error but OK')
  }
})

module.exports = router
