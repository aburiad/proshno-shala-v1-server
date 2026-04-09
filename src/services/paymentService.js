const axios = require('axios')
const { supabaseAdmin } = require('../config/supabase')
const { AppError } = require('../middleware/errorHandler')

const SSL_STORE_ID = process.env.SSLCOMMERZ_STORE_ID || 'test_store'
const SSL_STORE_PASS = process.env.SSLCOMMERZ_STORE_PASSWORD || 'test_pass'
const IS_SANDBOX = process.env.NODE_ENV !== 'production'

const SSL_URL = IS_SANDBOX
  ? 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php'
  : 'https://securepay.sslcommerz.com/gwprocess/v4/api.php'

const paymentService = {
  async initPayment(userId, amount, planDetails) {
    const { data: profile, error } = await supabaseAdmin.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) throw error
    if (!profile) throw new AppError('User not found', 404)

    const tranId = `TRAN_${Date.now()}_${String(userId).slice(0, 8)}`

    if (process.env.PAYMENT_DEMO_MODE === 'true') {
      await supabaseAdmin.from('payments').insert({
        tran_id: tranId,
        user_id: userId,
        amount,
        plan: planDetails.id,
        status: 'pending',
        demo: true,
      })
      return `${process.env.BACKEND_URL}/api/payment/success?tran_id=${tranId}&demo=true`
    }

    const data = {
      store_id: SSL_STORE_ID,
      store_passwd: SSL_STORE_PASS,
      total_amount: amount,
      currency: 'BDT',
      tran_id: tranId,
      success_url: `${process.env.BACKEND_URL}/api/payment/success?tran_id=${tranId}`,
      fail_url: `${process.env.BACKEND_URL}/api/payment/fail?tran_id=${tranId}`,
      cancel_url: `${process.env.BACKEND_URL}/api/payment/cancel?tran_id=${tranId}`,
      ipn_url: `${process.env.BACKEND_URL}/api/payment/ipn`,
      shipping_method: 'NO',
      product_name: planDetails.name,
      product_category: 'Service',
      product_profile: 'general',
      cus_name: profile.display_name || 'User',
      cus_email: profile.email || 'user@example.com',
      cus_add1: 'Dhaka',
      cus_city: 'Dhaka',
      cus_country: 'Bangladesh',
      cus_phone: profile.phone || '01XXXXXXXXX',
    }

    await supabaseAdmin.from('payments').insert({
      tran_id: tranId,
      user_id: userId,
      amount,
      plan: planDetails.id,
      status: 'pending',
    })

    try {
      const response = await axios.post(SSL_URL, new URLSearchParams(data))
      if (response.data.status === 'SUCCESS') {
        return response.data.GatewayPageURL
      }
      throw new AppError(response.data.failedreason || 'Payment initialization failed', 400)
    } catch (err) {
      console.error('SSLCommerz Init Error:', err.response?.data || err.message)
      throw new AppError('পেমেন্ট গেটওয়ে কানেক্ট করতে সমস্যা হচ্ছে', 503)
    }
  },

  async completePayment(tranId, valId) {
    const { data: payment, error } = await supabaseAdmin.from('payments').select('*').eq('tran_id', tranId).maybeSingle()
    if (error) throw error
    if (!payment) throw new AppError('Transaction not found', 404)
    if (payment.status === 'success') return payment.user_id

    if (payment.demo) {
      await supabaseAdmin
        .from('payments')
        .update({
          status: 'success',
          val_id: valId || 'demo',
          gateway_response: 'DEMO',
          updated_at: new Date().toISOString(),
        })
        .eq('tran_id', tranId)
      const expiryDate = new Date()
      expiryDate.setMonth(expiryDate.getMonth() + 1)
      await supabaseAdmin
        .from('profiles')
        .update({
          subscription: 'pro',
          subscription_end_at: expiryDate.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.user_id)
      return payment.user_id
    }

    const VALIDATION_URL = IS_SANDBOX
      ? 'https://sandbox.sslcommerz.com/validator/api/validationserver.php'
      : 'https://securepay.sslcommerz.com/validator/api/validationserver.php'

    try {
      const response = await axios.get(VALIDATION_URL, {
        params: {
          val_id: valId,
          store_id: SSL_STORE_ID,
          store_passwd: SSL_STORE_PASS,
          format: 'json',
        },
      })

      const data = response.data
      if (data.status !== 'VALID' && data.status !== 'AUTHENTICATED') {
        console.warn('Payment Validation Failed:', data)
        throw new AppError('পেমেন্ট ভেরিফিকেশন ব্যর্থ হয়েছে।', 400)
      }

      if (parseFloat(data.amount) < parseFloat(payment.amount)) {
        throw new AppError('পেমেন্ট অ্যামাউন্ট মেলেনি।', 400)
      }
    } catch (err) {
      if (err instanceof AppError) throw err
      console.error('SSLCommerz Validation Error:', err.message)
      throw new AppError('পেমেন্ট ভেরিফাই করতে সমস্যা হচ্ছে।', 503)
    }

    await supabaseAdmin
      .from('payments')
      .update({
        status: 'success',
        val_id: valId,
        gateway_response: 'VALIDATED',
        updated_at: new Date().toISOString(),
      })
      .eq('tran_id', tranId)

    const expiryDate = new Date()
    expiryDate.setMonth(expiryDate.getMonth() + 1)

    await supabaseAdmin
      .from('profiles')
      .update({
        subscription: 'pro',
        subscription_end_at: expiryDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.user_id)

    return payment.user_id
  },
}

module.exports = paymentService
