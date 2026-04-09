const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function checkModels() {
  const key = process.env.GEMINI_API_KEY;
  console.log('Testing key starting with:', key.substring(0, 7) + '...');
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    const { data } = await axios.get(url);
    const models = data.models;
    console.log('Available models:');
    models.forEach(m => {
      if (m.name.includes('flash') || m.name.includes('pro')) {
        console.log(`- ${m.name} (${m.displayName}) [${m.supportedGenerationMethods.join(', ')}]`);
      }
    });
  } catch (err) {
    console.error('Error listing models:', err.response?.data || err.message);
  }
}

checkModels();
