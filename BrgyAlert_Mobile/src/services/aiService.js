import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Predicts the incident category, urgency, and short reasoning based on incident details.
 * @param {string} details 
 * @returns {Promise<{ category: string, urgency: string, reasoning: string }|null>}
 */
export async function predictIncidentAttributes(details) {
  if (!details || details.trim().length < 8) {
    return null;
  }

  try {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[aiService] EXPO_PUBLIC_GEMINI_API_KEY is missing. Skipping AI prediction.');
      return null;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are an emergency triage assistant for a barangay/local community command center.
Analyze these incident details: "${details}"

Predict the best matching attributes from these options:
1. Category. Must be strictly one of: "Fire", "Medical", "Flood", "Crime", "Accident", "General"
2. Urgency. Must be strictly one of: "Low", "Medium", "High", "Critical"

Provide a short reasoning (maximum 1 sentence).
You MUST respond ONLY in raw JSON format matching this exact schema:
{
  "category": "Fire" | "Medical" | "Flood" | "Crime" | "Accident" | "General",
  "urgency": "Low" | "Medium" | "High" | "Critical",
  "reasoning": "string explanation"
}
Do not write markdown formatting (like \`\`\`json), do not write any greetings, prefix, or suffix. Just return the JSON string.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Clean up markdown block if model output includes it despite prompt
    let cleanedText = text;
    if (text.startsWith('```')) {
      cleanedText = text.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('[aiService] Error predicting incident attributes:', error);
    return null;
  }
}

/**
 * Summarizes the incident report details in active voice into 10 words or less.
 * @param {string} details 
 * @returns {Promise<string>}
 */
export async function generateIncidentSummary(details) {
  if (!details || details.trim().length < 8) {
    return '';
  }

  try {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[aiService] EXPO_PUBLIC_GEMINI_API_KEY is missing. Skipping AI summary generation.');
      return '';
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Summarize this local incident report details in active voice into a single concise Tagalog title/phrase of 10 words or less:
"${details}"

Example Output: "May sunog sa kusina malapit sa Plaza Rizal"
Do not add quotes, do not write any prefixes or commentary. Just output the Tagalog summary directly.`;

    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();

    // Strip surrounding quotes if the model added them
    if (text.startsWith('"') && text.endsWith('"')) {
      text = text.substring(1, text.length - 1);
    }

    return text;
  } catch (error) {
    console.error('[aiService] Error generating incident summary:', error);
    return '';
  }
}

/**
 * Evaluates if an incident description is likely fake, spam, gibberish, or joke text.
 * @param {string} details 
 * @returns {Promise<{ isFake: boolean, confidence: 'Low' | 'Medium' | 'High', reasoning: string }>}
 */
export async function analyzeIncidentValidity(details) {
  if (!details || details.trim().length < 8) {
    return { isFake: false, confidence: 'Low', reasoning: 'Too short to analyze' };
  }

  try {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[aiService] EXPO_PUBLIC_GEMINI_API_KEY is missing. Skipping AI validity check.');
      return { isFake: false, confidence: 'Low', reasoning: 'API key missing' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are an emergency triage validator for a barangay/local community command center.
Analyze these incident details: "${details}"

Determine if this is a spam, fake, test, joke, gibberish, or keyboard mash report.
- "isFake" should be true if it's clear spam (e.g. random letters like "asdfghjk", insults, joke text like "I saw a flying dragon", or obvious test messages like "testing only, ignore this").
- "isFake" should be false if it describes any possible emergency or normal local issue (e.g. fire, medical emergency, robbery, loud noise, garbage, flood, accident) even if written in conversational or informal local languages like Tagalog or Taglish.
- "confidence" must be "Low", "Medium", or "High". Use "High" or "Medium" if you are reasonably certain it is fake/spam.
- "reasoning" must be a single concise sentence (preferably in Tagalog or simple Taglish) explaining why it is flagged, or empty if it is not fake.

You MUST respond ONLY in raw JSON format matching this exact schema:
{
  "isFake": true | false,
  "confidence": "Low" | "Medium" | "High",
  "reasoning": "string explanation in Tagalog or empty"
}
Do not write markdown formatting (like \`\`\`json), do not write any greetings, prefix, or suffix. Just return the JSON string.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Clean up markdown block if model output includes it despite prompt
    let cleanedText = text;
    if (text.startsWith('```')) {
      cleanedText = text.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    const parsed = JSON.parse(cleanedText);
    return {
      isFake: !!parsed.isFake,
      confidence: parsed.confidence || 'Low',
      reasoning: parsed.reasoning || ''
    };
  } catch (error) {
    console.error('[aiService] Error analyzing incident validity:', error);
    return { isFake: false, confidence: 'Low', reasoning: 'Error during validation' };
  }
}

/**
 * Evaluates if the attached evidence images match or are consistent with the reported category and details.
 * @param {string} details 
 * @param {string} category 
 * @param {Array<{ data: string, mimeType: string }>} base64Images 
 * @returns {Promise<{ imageMatches: boolean, confidence: 'Low' | 'Medium' | 'High', reasoning: string }>}
 */
export async function analyzeIncidentImages(details, category, base64Images) {
  if (!base64Images || base64Images.length === 0) {
    return { imageMatches: true, confidence: 'Low', reasoning: 'No images to analyze' };
  }

  try {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[aiService] EXPO_PUBLIC_GEMINI_API_KEY is missing. Skipping AI image match check.');
      return { imageMatches: true, confidence: 'Low', reasoning: 'API key missing' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are an emergency triage validator for a barangay/local community command center.
Analyze if the attached image(s) match or are consistent with the reported incident details ("${details}") and category ("${category}").

Guidelines:
- "imageMatches" should be true if the image content matches or is contextually consistent with the reported issue (e.g., if category is "Fire" and the image shows a fire, smoke, burnt area, fire truck, fire extinguisher, etc.; or if it is "Flood" and shows flooded streets, rain, high water level).
- "imageMatches" should be false if the image is completely unrelated, spam, or joke evidence (e.g. a meme, a screenshot of a chat window, a blank/black photo, a selfie showing no emergency or hazard, a pet photo, a random download, or game screenshot).
- "confidence" must be "Low", "Medium", or "High".
- "reasoning" must be a single concise sentence in Tagalog or simple Taglish explaining why the images are flagged as mismatched/unrelated. If they match, reasoning should be empty.

You MUST respond ONLY in raw JSON format matching this exact schema:
{
  "imageMatches": true | false,
  "confidence": "Low" | "Medium" | "High",
  "reasoning": "string explanation in Tagalog or empty"
}
Do not write markdown formatting (like \`\`\`json), do not write any greetings, prefix, or suffix. Just return the JSON string.`;

    const parts = [
      prompt,
      ...base64Images.map(img => ({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType
        }
      }))
    ];

    const result = await model.generateContent(parts);
    const text = result.response.text().trim();

    // Clean up markdown block if model output includes it despite prompt
    let cleanedText = text;
    if (text.startsWith('```')) {
      cleanedText = text.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    const parsed = JSON.parse(cleanedText);
    return {
      imageMatches: parsed.imageMatches !== false,
      confidence: parsed.confidence || 'Low',
      reasoning: parsed.reasoning || ''
    };
  } catch (error) {
    console.error('[aiService] Error analyzing incident images:', error);
    return { imageMatches: true, confidence: 'Low', reasoning: 'Error during validation' };
  }
}


