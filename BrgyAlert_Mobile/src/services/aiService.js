import { GoogleGenerativeAI } from '@google/generative-ai';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Utility to check if AI requests are currently rate limited within the hourly sliding window, without registering a new request.
 * @param {string} role 'citizen' | 'admin' | 'responder'
 * @returns {Promise<boolean>} True if rate limited, false if allowed.
 */
export async function isAiRateLimited(role = 'citizen') {
  try {
    const isOwnerAdmin = role === 'admin' || role === 'responder';
    const limit = isOwnerAdmin ? 15 : 3;
    const storageKey = `ai_request_timestamps_${isOwnerAdmin ? 'admin' : 'citizen'}`;

    const rawTimestamps = await AsyncStorage.getItem(storageKey);
    let timestamps = rawTimestamps ? JSON.parse(rawTimestamps) : [];

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Filter out timestamps older than 1 hour
    timestamps = timestamps.filter(ts => ts > oneHourAgo);

    return timestamps.length >= limit;
  } catch (error) {
    console.log('[aiService] Error checking AI rate limit state:', error);
    return false;
  }
}

/**
 * Utility to verify and register AI requests within an hourly sliding window.
 * Citizens: Max 3 requests/hour.
 * Admins/Responders: Max 15 requests/hour.
 * @param {string} role 'citizen' | 'admin' | 'responder'
 * @returns {Promise<boolean>} True if request is permitted, false if rate limited.
 */
export async function checkAndRegisterAiRequest(role = 'citizen') {
  try {
    const isOwnerAdmin = role === 'admin' || role === 'responder';
    const limit = isOwnerAdmin ? 15 : 3;
    const storageKey = `ai_request_timestamps_${isOwnerAdmin ? 'admin' : 'citizen'}`;

    const rawTimestamps = await AsyncStorage.getItem(storageKey);
    let timestamps = rawTimestamps ? JSON.parse(rawTimestamps) : [];

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Filter out timestamps older than 1 hour
    timestamps = timestamps.filter(ts => ts > oneHourAgo);

    if (timestamps.length >= limit) {
      console.log(`[aiService] AI rate limit reached for role "${role}". Blocked request. (Active: ${timestamps.length}/${limit})`);
      return false;
    }

    // Register current request
    timestamps.push(now);
    await AsyncStorage.setItem(storageKey, JSON.stringify(timestamps));
    return true;
  } catch (error) {
    console.log('[aiService] Error checking/registering AI rate limit, permitting request:', error);
    return true; // Fallback to allow request if AsyncStorage fails
  }
}

/**
 * Predicts the incident category, urgency, and short reasoning based on incident details.
 * @param {string} details 
 * @param {string} role
 * @returns {Promise<{ category: string, urgency: string, reasoning: string }|null>}
 */
export async function predictIncidentAttributes(details, role = 'citizen') {
  if (!details || details.trim().length < 8) {
    return null;
  }

  const allowed = await checkAndRegisterAiRequest(role);
  if (!allowed) {
    return null; // Return null so screen handles rate-limited fallback
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
    console.log('[aiService] Gemini AI service is currently offline or rate-limited. Falling back gracefully (Category/Urgency prediction).');
    return null;
  }
}

/**
 * Summarizes the incident report details in active voice into 10 words or less.
 * @param {string} details 
 * @param {string} role
 * @returns {Promise<string>}
 */
export async function generateIncidentSummary(details, role = 'admin') {
  if (!details || details.trim().length < 8) {
    return '';
  }

  const allowed = await checkAndRegisterAiRequest(role);
  if (!allowed) {
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
    console.log('[aiService] Gemini AI service is currently offline or rate-limited. Falling back gracefully (Summary generation).');
    return '';
  }
}

/**
 * Evaluates if an incident description is likely fake, spam, gibberish, or joke text.
 * @param {string} details 
 * @param {string} role
 * @returns {Promise<{ isFake: boolean, confidence: 'Low' | 'Medium' | 'High', reasoning: string }>}
 */
export async function analyzeIncidentValidity(details, role = 'admin') {
  if (!details || details.trim().length < 8) {
    return { isFake: false, confidence: 'Low', reasoning: 'Too short to analyze' };
  }

  const allowed = await checkAndRegisterAiRequest(role);
  if (!allowed) {
    return { isFake: false, confidence: 'Low', reasoning: 'AI Rate limit reached' };
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
    console.log('[aiService] Gemini AI service is currently offline or rate-limited. Falling back gracefully (Validity checker).');
    return { isFake: false, confidence: 'Low', reasoning: 'AI Service is temporarily unavailable' };
  }
}

/**
 * Consolidated Incident Submission AI Processor
 * Consolidates Summary, Validity (text), and Image match checks in 1 single request.
 * @param {string} details 
 * @param {string} category 
 * @param {Array<{ data: string, mimeType: string }>} base64Images 
 * @param {string} role 
 * @returns {Promise<{ rateLimited?: boolean, summary: string, isFake: boolean, textReasoning: string, textConfidence: string, imageMatches: boolean, imageReasoning: string, imageConfidence: string, urgency: string, category: string }>}
 */
export async function processIncidentSubmissionAI(details, category, base64Images = [], role = 'citizen') {
  if (!details || details.trim().length < 8) {
    return {
      summary: '',
      isFake: false,
      textReasoning: '',
      textConfidence: 'Low',
      imageMatches: true,
      imageReasoning: '',
      imageConfidence: 'Low',
      urgency: 'medium',
      category: category
    };
  }

  const allowed = await checkAndRegisterAiRequest(role);
  if (!allowed) {
    return {
      rateLimited: true,
      summary: '',
      isFake: false,
      textReasoning: 'Rate limit reached',
      textConfidence: 'Low',
      imageMatches: true,
      imageReasoning: '',
      imageConfidence: 'Low',
      urgency: 'medium',
      category: category
    };
  }

  try {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[aiService] EXPO_PUBLIC_GEMINI_API_KEY is missing. Skipping consolidated AI processing.');
      return {
        summary: '',
        isFake: false,
        textReasoning: 'API key missing',
        textConfidence: 'Low',
        imageMatches: true,
        imageReasoning: '',
        imageConfidence: 'Low',
        urgency: 'medium',
        category: category
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are an emergency triage and verification assistant for a local community command center.
Analyze the following incident report text and any attached images.

Incident Description: "${details}"
Reporter's Selected Category: "${category}"

Your tasks:
1. Summarize: Provide a highly concise brief summary in Tagalog/Taglish of 10 words or less describing the situation in active voice (e.g. "May sunog sa kusina malapit sa Plaza Rizal").
2. Validate Text (isFake): Determine if this description is spam, fake, gibberish (e.g. keyboard mashing like "asdfghjk"), a joke, or a template test report.
   - Set "isFake" to true if it is spam, a joke, gibberish, or an obvious template test message.
   - Set "isFake" to false if it describes any possible emergency or normal local issue.
   - Provide "textReasoning" in Tagalog (max 1 sentence) explaining why it was flagged as fake, or leave it empty if valid.
   - Provide "textConfidence": "Low" | "Medium" | "High".
3. Validate Images (imageMatches): If images are attached, evaluate if they match or are contextually consistent with the description and category.
   - Set "imageMatches" to true if there are no images, OR if the images show content matching or contextually related to the reported issue.
   - Set "imageMatches" to false if the images are completely unrelated (e.g., memes, blank screens, screenshots of chats, selfies showing no hazard, pet photos).
   - Provide "imageReasoning" in Tagalog (max 1 sentence) explaining why the image is unrelated, or leave it empty.
   - Provide "imageConfidence": "Low" | "Medium" | "High".
4. Predict Urgency: Urgency must be strictly one of: "Low", "Medium", "High", "Critical".
5. Predict Category: Predict the best matching category. Must be strictly one of: "Fire", "Medical", "Flood", "Crime", "Accident", "General".

You MUST respond ONLY in raw JSON format matching this exact schema:
{
  "summary": "10-word Tagalog phrase",
  "isFake": true | false,
  "textReasoning": "string explanation or empty",
  "textConfidence": "Low" | "Medium" | "High",
  "imageMatches": true | false,
  "imageReasoning": "string explanation or empty",
  "imageConfidence": "Low" | "Medium" | "High",
  "urgency": "Low" | "Medium" | "High" | "Critical",
  "category": "Fire" | "Medical" | "Flood" | "Crime" | "Accident" | "General"
}
Do not write markdown formatting (like \`\`\`json), do not write prefixes or suffixes. Just return the JSON string.`;

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

    let cleanedText = text;
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    const parsed = JSON.parse(cleanedText);
    return {
      summary: parsed.summary || '',
      isFake: parsed.isFake === true || parsed.isFake === 'true',
      textReasoning: parsed.textReasoning || '',
      textConfidence: parsed.textConfidence || 'Low',
      imageMatches: parsed.imageMatches !== false && parsed.imageMatches !== 'false',
      imageReasoning: parsed.imageReasoning || '',
      imageConfidence: parsed.imageConfidence || 'Low',
      urgency: parsed.urgency || 'medium',
      category: parsed.category || category
    };
  } catch (error) {
    console.log('[aiService] Consolidated incident analysis failed, falling back:', error);
    return {
      summary: '',
      isFake: false,
      textReasoning: 'AI service unavailable',
      textConfidence: 'Low',
      imageMatches: true,
      imageReasoning: '',
      imageConfidence: 'Low',
      urgency: 'medium',
      category: category
    };
  }
}
