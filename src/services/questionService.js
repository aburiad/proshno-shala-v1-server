const { supabaseAdmin } = require('../config/supabase')
const { AppError } = require('../middleware/errorHandler')

const questionService = {
  async saveToBank(userId, questionData) {
    const { count, error: cErr } = await supabaseAdmin
      .from('question_bank')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
    if (cErr) throw cErr
    if ((count || 0) >= 50) {
      throw new AppError('ফ্রি প্ল্যানে সর্বোচ্চ ৫০টি প্রশ্ন সেভ করা যায়।', 403)
    }

    const row = {
      user_id: userId,
      type: questionData.type,
      data: questionData.data,
      subject: questionData.subject || '',
      chapter: questionData.chapter || '',
      difficulty: questionData.difficulty || null,
      tags: questionData.tags || [],
    }

    const { data, error } = await supabaseAdmin.from('question_bank').insert(row).select().single()
    if (error) throw error

    return {
      id: data.id,
      type: data.type,
      data: data.data,
      subject: data.subject,
      chapter: data.chapter,
      difficulty: data.difficulty,
      tags: data.tags,
      userId: data.user_id,
      createdAt: data.created_at,
    }
  },

  async listQuestions(userId, filters = {}) {
    let q = supabaseAdmin.from('question_bank').select('*').eq('user_id', userId)
    const { data, error } = await q.order('created_at', { ascending: false })
    if (error) throw error

    let questions = (data || []).map((r) => ({
      id: r.id,
      type: r.type,
      data: r.data,
      subject: r.subject,
      chapter: r.chapter,
      difficulty: r.difficulty,
      tags: r.tags,
      userId: r.user_id,
      createdAt: r.created_at,
    }))

    if (filters.subject) {
      questions = questions.filter((x) => x.subject === filters.subject)
    }
    if (filters.type) {
      questions = questions.filter((x) => x.type === filters.type)
    }
    if (filters.difficulty) {
      questions = questions.filter((x) => x.difficulty === filters.difficulty)
    }
    if (filters.search) {
      const s = filters.search.toLowerCase()
      questions = questions.filter((q) => {
        const d = q.data || {}
        return (
          (d.question && String(d.question).toLowerCase().includes(s)) ||
          (d.stimulus && String(d.stimulus).toLowerCase().includes(s)) ||
          (d.topic && String(d.topic).toLowerCase().includes(s))
        )
      })
    }

    return questions
  },

  async deleteQuestion(userId, questionId) {
    const { error } = await supabaseAdmin
      .from('question_bank')
      .delete()
      .eq('id', questionId)
      .eq('user_id', userId)
    if (error) throw error
    return { success: true }
  },
}

module.exports = questionService
