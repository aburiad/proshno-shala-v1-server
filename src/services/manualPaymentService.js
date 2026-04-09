const { supabaseAdmin } = require('../config/supabase')
const { AppError } = require('../middleware/errorHandler')

const manualPaymentService = {
  async submitManualPayment(userId, { amount, method, tranId, phone, email }) {
    if (!amount || !method || !tranId || !phone) {
      throw new AppError('সব ফিল্ড পূরণ করুন', 400)
    }

    const row = {
      user_id: userId,
      email: email || 'No Email',
      amount: String(amount),
      method,
      tran_id: String(tranId).toUpperCase(),
      phone,
      status: 'pending',
    }

    const { data, error } = await supabaseAdmin.from('manual_payments').insert(row).select().single()
    if (error) throw error

    return {
      id: data.id,
      userId: data.user_id,
      email: data.email,
      amount: data.amount,
      method: data.method,
      tranId: data.tran_id,
      phone: data.phone,
      status: data.status,
      createdAt: data.created_at,
    }
  },

  async listPendingPayments() {
    const { data, error } = await supabaseAdmin
      .from('manual_payments')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map((p) => ({
      id: p.id,
      userId: p.user_id,
      email: p.email,
      amount: p.amount,
      method: p.method,
      tranId: p.tran_id,
      phone: p.phone,
      status: p.status,
      createdAt: p.created_at,
    }))
  },

  async verifyPayment(paymentId, status, adminId) {
    if (!['verified', 'rejected'].includes(status)) {
      throw new AppError('Invalid status', 400)
    }

    const { data: payment, error: fErr } = await supabaseAdmin
      .from('manual_payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle()
    if (fErr) throw fErr
    if (!payment) throw new AppError('Payment not found', 404)
    if (payment.status !== 'pending') {
      throw new AppError('This payment has already been processed', 400)
    }

    const { error: uErr } = await supabaseAdmin
      .from('manual_payments')
      .update({
        status,
        verified_by: adminId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId)
    if (uErr) throw uErr

    if (status === 'verified') {
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
    }

    return true
  },
}

module.exports = manualPaymentService
