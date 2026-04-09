const { supabaseAdmin } = require('../config/supabase')
const { AppError } = require('./errorHandler')
const configService = require('../services/configService')

const checkLimit = (limitType) => {
  return async (req, res, next) => {
    try {
      const config = await configService.getConfig()
      const profile = req.profile
      if (!profile) throw new AppError('User not found', 404)

      if (profile.subscription === 'pro') {
        if (!profile.subscription_end_at || new Date(profile.subscription_end_at) >= new Date()) {
          return next()
        }
      }

      if (config.isTrialActive && profile.created_at) {
        const trialExpiry = new Date(
          new Date(profile.created_at).getTime() + config.trialDays * 24 * 60 * 60 * 1000
        )
        if (new Date() < trialExpiry) {
          return next()
        }
      }

      if (limitType === 'question_bank') {
        const { count, error } = await supabaseAdmin
          .from('question_bank')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', req.user.uid)
        if (error) throw error
        if ((count || 0) >= 50) {
          throw new AppError(
            'ফ্রি প্ল্যানে সর্বোচ্চ ৫০টি প্রশ্ন সেভ করা যায়। আনলিমিটেড সেভ করতে Pro তে আপগ্রেড করুন।',
            403
          )
        }
      }

      if (limitType === 'paper_count') {
        const { count, error } = await supabaseAdmin
          .from('papers')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', req.user.uid)
          .eq('deleted', false)
        if (error) throw error
        if ((count || 0) >= 5) {
          throw new AppError(
            'ফ্রি প্ল্যানে সর্বোচ্চ ৫টি প্রশ্নপত্র তৈরি করা যায়। আনলিমিটেড তৈরি করতে Pro তে আপগ্রেড করুন।',
            403
          )
        }
      }

      if (limitType === 'ai_scan' || limitType === 'ai_tool') {
        const scanCount = profile.ai_scan_count || 0
        if (scanCount >= 10) {
          throw new AppError('আপনার ফ্রি AI লিমিট শেষ হয়ে গেছে। Pro তে আপগ্রেড করুন।', 403)
        }
      }

      if (limitType === 'omr') {
        throw new AppError('OMR জেনারেটর শুধুমাত্র Pro ইউজারদের জন্য। এখনই আপগ্রেড করুন।', 403)
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}

module.exports = { checkLimit }
