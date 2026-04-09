const puppeteer = require('puppeteer')
const { buildPaperHTML } = require('./pdfTemplate')

const fs = require('fs')
const path = require('path')

let browserInstance = null

function findChromePath() {
  const commonPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ]

  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      console.log('Found system Chrome at:', p)
      return p
    }
  }
  return null
}

async function getBrowser() {
  if (browserInstance && browserInstance.connected) {
    return browserInstance
  }

  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  }

  try {
    console.log('Launching Puppeteer (Standard)...')
    browserInstance = await puppeteer.launch(launchOptions)
    console.log('Puppeteer launched successfully')
  } catch (err) {
    console.warn('Standard Puppeteer launch failed, trying system Chrome fallback...', err.message)
    const systemPath = findChromePath()
    if (systemPath) {
      try {
        browserInstance = await puppeteer.launch({
          ...launchOptions,
          executablePath: systemPath,
        })
        console.log('Puppeteer launched using system Chrome')
      } catch (err2) {
        console.error('System Chrome fallback also failed:', err2.message)
        throw err2
      }
    } else {
      console.error('No system Chrome found and standard launch failed.')
      throw err
    }
  }

  browserInstance.on('disconnected', () => {
    console.log('Browser disconnected')
    browserInstance = null
  })

  return browserInstance
}

/**
 * Generate PDF buffer from paper data.
 * @param {Object} paper - Paper document from Firestore
 * @param {Object} options - { variant: 'A'|'B'|null }
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generatePDF(paper, options = {}) {
  console.log('Generating PDF for paper:', paper.id, 'with variant:', options.variant)
  
  if (!paper.questions || paper.questions.length === 0) {
    console.warn('Paper has no questions!')
  } else {
    console.log('Paper has', paper.questions.length, 'questions')
  }

  const questions = [...(paper.questions || [])]

  // Shuffle questions for Set B variant
  if (options.variant === 'B') {
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[questions[i], questions[j]] = [questions[j], questions[i]]
    }
  }

  let html
  try {
    html = buildPaperHTML(
      {
        ...paper,
        set_variant: options.variant || paper.set_variant,
      },
      { 
        questions, 
        font: options.font,
        size: options.size,
        spacing: options.spacing
      }
    )
    console.log('HTML built successfully, length:', html.length)
  } catch (err) {
    console.error('HTML Build Error:', err)
    throw err
  }

  try {
    const browser = await getBrowser()
    console.log('Browser instance obtained')
    const page = await browser.newPage()
    console.log('New page created')

    try {
      console.log('Setting page content...')
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 })
      console.log('Page content set successfully')

      // Wait a bit for fonts to load
      await page.waitForTimeout(500)

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
      })
      console.log('PDF generated, buffer size:', pdfBuffer.length)

      if (pdfBuffer.length < 1000) {
        console.warn('PDF buffer is very small, might be empty')
      }

      return Buffer.from(pdfBuffer)
    } catch (err) {
      console.error('PDF Generation Error:', err.message)
      throw err
    } finally {
      await page.close()
    }
  } catch (err) {
    console.error('Browser/PDF Error:', err)
    throw err
  }
}

/**
 * Cleanup browser on process exit
 */
async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close()
    browserInstance = null
  }
}

process.on('SIGINT', closeBrowser)
process.on('SIGTERM', closeBrowser)

module.exports = { generatePDF, closeBrowser }
