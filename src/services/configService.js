const { supabaseAdmin } = require('../config/supabase')

const DEFAULT_CONFIG = {
  pro_price: 299,
  trial_days: 90,
  is_trial_active: true,
  manual_payment_methods: [
    { name: 'bKash', number: '01XXXXXXXXX', type: 'Personal' },
    { name: 'Nagad', number: '01XXXXXXXXX', type: 'Personal' },
    { name: 'Rocket', number: '01XXXXXXXXX', type: 'Personal' },
  ],
  features: [
    'আনলিমিটেড প্রশ্নপত্র',
    'আনলিমিটেড প্রশ্ন ব্যাংক',
    'আনলিমিটেড AI স্ক্যান',
    'নিজের লোগো ব্যবহার',
    'ওয়াটারমার্ক ছাড়া প্রিন্ট',
    'OMR জেনারেটর',
    'এক্সক্লুসিভ পিডিএফ লেআউট',
    'ডেডিকেটেড সাপোর্ট',
  ],
}

function rowToConfig(row) {
  if (!row) return null
  return {
    proPrice: row.pro_price,
    trialDays: row.trial_days,
    isTrialActive: row.is_trial_active,
    manualPaymentMethods: row.manual_payment_methods,
    features: row.features,
    updatedAt: row.updated_at,
  }
}

const configService = {
  async getConfig() {
    const { data, error } = await supabaseAdmin.from('subscription_config').select('*').eq('id', 1).maybeSingle()
    if (error) throw error
    if (!data) {
      await this.updateConfig({
        proPrice: DEFAULT_CONFIG.pro_price,
        trialDays: DEFAULT_CONFIG.trial_days,
        isTrialActive: DEFAULT_CONFIG.is_trial_active,
        manualPaymentMethods: DEFAULT_CONFIG.manual_payment_methods,
        features: DEFAULT_CONFIG.features,
      })
      return {
        proPrice: DEFAULT_CONFIG.pro_price,
        trialDays: DEFAULT_CONFIG.trial_days,
        isTrialActive: DEFAULT_CONFIG.is_trial_active,
        manualPaymentMethods: DEFAULT_CONFIG.manual_payment_methods,
        features: DEFAULT_CONFIG.features,
      }
    }
    const c = rowToConfig(data)
    return {
      proPrice: c.proPrice,
      trialDays: c.trialDays,
      isTrialActive: c.isTrialActive,
      manualPaymentMethods: c.manualPaymentMethods,
      features: c.features,
      updatedAt: c.updatedAt,
    }
  },

  async updateConfig(newConfig) {
    const patch = {
      pro_price: newConfig.pro_price ?? newConfig.proPrice,
      trial_days: newConfig.trial_days ?? newConfig.trialDays,
      is_trial_active: newConfig.is_trial_active ?? newConfig.isTrialActive,
      manual_payment_methods: newConfig.manual_payment_methods ?? newConfig.manualPaymentMethods,
      features: newConfig.features,
      updated_at: new Date().toISOString(),
    }
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k])

    const { data, error } = await supabaseAdmin
      .from('subscription_config')
      .upsert({ id: 1, ...patch }, { onConflict: 'id' })
      .select()
      .single()
    if (error) throw error
    const c = rowToConfig(data)
    return {
      proPrice: c.proPrice,
      trialDays: c.trialDays,
      isTrialActive: c.isTrialActive,
      manualPaymentMethods: c.manualPaymentMethods,
      features: c.features,
      updatedAt: c.updatedAt,
    }
  },
}

module.exports = configService
