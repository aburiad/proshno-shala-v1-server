/**
 * Seed Book Content Script
 * 
 * Usage:
 *   1. Create a JSON file with chapter text (see sample below)
 *   2. Run: node server/src/scripts/seedBookContent.js <path-to-json>
 * 
 * Sample JSON format (chapters.json):
 * {
 *   "classNum": 9,
 *   "subject": "bangla",
 *   "chapters": [
 *     {
 *       "id": "chapter_1",
 *       "title": "অতিথির স্মৃতি",
 *       "type": "গল্প",
 *       "full_text": "গল্পের পুরো টেক্সট এখানে পেস্ট করুন..."
 *     }
 *   ]
 * }
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const fs = require('fs')
const path = require('path')
const { GoogleGenerativeAI } = require('@google/generative-ai')

const bookService = require('../services/bookService')

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ 
  model: 'gemini-flash-latest',
  generationConfig: {
    maxOutputTokens: 4096,
    temperature: 0.3,
  }
})

async function generateSummaryAndPoints(title, fullText) {
  const prompt = `
তুমি একজন বাংলাদেশের এনসিটিবি পাঠ্যবই বিশেষজ্ঞ।

নিচে "${title}" শিরোনামের একটি চ্যাপ্টারের সম্পূর্ণ টেক্সট দেওয়া হলো।

তুমি ২টি কাজ করবে:
1. "ai_summary": চ্যাপ্টারের একটি সংক্ষিপ্ত সারসংক্ষেপ লিখবে (৪০০-৬০০ শব্দ)
2. "question_points": শিক্ষক যেন এই চ্যাপ্টার থেকে প্রশ্ন তৈরি করতে পারেন, সেই উদ্দেশ্যে ৬০-১০০টি গুরুত্বপূর্ণ পয়েন্ট বের করবে। পয়েন্টগুলো হবে সংক্ষিপ্ত কিন্তু তথ্যবহুল বাক্য। প্রতিটি টপিক (যেমন: অঙ্কপাতন, দেশীয় ও আন্তর্জাতিক রীতি, বৃহত্তম/ক্ষুদ্রতম সংখ্যা) থেকে পর্যাপ্ত পয়েন্ট নিতে হবে যেন চ্যাপ্টারের কোনো অংশ বাদ না যায়।

### চ্যাপ্টার টেক্সট:
${fullText}

### আউটপুট ফরম্যাট (শুধু JSON):
{
  "ai_summary": "সারসংক্ষেপ...",
  "question_points": ["পয়েন্ট ১", "পয়েন্ট ২", "..."]
}

শুধু JSON দাও। কোনো ব্যাখ্যা দিও না।
`

  const result = await model.generateContent(prompt)
  const response = await result.response
  let text = response.text()
  text = text.replace(/```json/g, '').replace(/```/g, '').trim()
  return JSON.parse(text)
}

async function seedChapters(inputPath) {
  console.log(`\n📚 Reading input file: ${inputPath}\n`)
  
  const raw = fs.readFileSync(inputPath, 'utf-8')
  const data = JSON.parse(raw)
  
  const { classNum, subject, chapters } = data
  
  if (!classNum || !subject || !chapters || !Array.isArray(chapters)) {
    console.error('❌ Invalid JSON format. Need: { classNum, subject, chapters: [...] }')
    process.exit(1)
  }

  console.log(`📖 Class: ${classNum}, Subject: ${subject}`)
  console.log(`📝 Chapters to process: ${chapters.length}\n`)

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]
    console.log(`\n[${i + 1}/${chapters.length}] Processing: ${ch.title}...`)

    try {
      // Generate summary and question points
      console.log('  🤖 Calling Gemini for summary & points...')
      const aiData = await generateSummaryAndPoints(ch.title, ch.full_text)
      
      console.log(`  ✅ Got ${aiData.question_points?.length || 0} points`)

      // Save to RTDB
      const chapterData = {
        title: ch.title,
        type: ch.type || '',
        full_text: ch.full_text,
        ai_summary: aiData.ai_summary || '',
        question_points: aiData.question_points || [],
        metadata: {
          class: classNum,
          subject,
          chapterNumber: i + 1,
          pageCount: Math.ceil(ch.full_text.length / 2000),
        },
      }

      await bookService.saveChapter(classNum, subject, ch.id, chapterData)
      console.log(`  💾 Saved to: book_chapters/${classNum}/${subject}/${ch.id}`)
      
      // Delay between chapters to avoid rate limiting
      if (i < chapters.length - 1) {
        console.log('  ⏳ Waiting 3 seconds...')
        await new Promise(r => setTimeout(r, 3000))
      }
    } catch (err) {
      console.error(`  ❌ Error processing ${ch.title}:`, err.message)
    }
  }

  console.log('\n\n🎉 Seed complete!\n')
  process.exit(0)
}

// Entrypoint
const inputFile = process.argv[2]
if (!inputFile) {
  console.log(`
📚 Book Content Seed Script
Usage: node seedBookContent.js <path-to-chapters.json>

Sample JSON:
{
  "classNum": 9,
  "subject": "bangla",
  "chapters": [
    {
      "id": "chapter_1",
      "title": "অতিথির স্মৃতি",
      "type": "গল্প",
      "full_text": "গল্পের পুরো টেক্সট..."
    }
  ]
}
  `)
  process.exit(1)
}

seedChapters(path.resolve(inputFile))
