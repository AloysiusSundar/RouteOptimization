import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured in .env.local' }, { status: 500 });
    }

    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = `
      You are an expert travel assistant. Extract structured itinerary data from the user's text.
      Return ONLY a JSON object. Do not include markdown formatting or extra text.
      
      Current date: ${today}
      
      Rules:
      1. IDENTIFY THE BASE CITY/REGION (e.g., New York, Tokyo, London).
      2. IDENTIFY THE STAY LOCATION / HOTEL (e.g. "Hilton", "staying at my friend's place in Shinjuku").
         CRITICAL: Only populate stayLocation if the user explicitly names a hotel, apartment, or address. 
         IF the user only mentions the city (e.g. "Plan a trip to SF"), stayLocation MUST BE NULL or empty string.
         DO NOT set stayLocation to the name of the Base City itself.
      3. APPEND THE BASE CITY NAME TO EVERY PLACE NAME (e.g. "Met Museum" -> "Met Museum, NYC"). This is CRITICAL for geocoding accuracy.
      4. If the user mentions "tomorrow", "next week", etc., calculate based on ${today}.
      5. Durations should be in minutes (default 60 if not specified).
      6. isReservation should be true ONLY if they clearly mention a booking, reservation, or fixed time.
      7. If reservationTime is mentioned, format as HH:MM.
      8. Output Schema:
      {
        "startDate": "YYYY-MM-DD",
        "days": number,
        "baseCity": "string",
        "stayLocation": "string | null",
        "places": [
          { "name": "string", "duration": number, "isReservation": boolean, "reservationDate": "YYYY-MM-DD", "reservationTime": "HH:MM" }
        ]
      }
    `;

    async function tryModel(modelName: string) {
      console.log(`🤖 Attempting extraction with ${modelName}...`);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${systemPrompt}\n\nUser text: ${prompt}` }]
          }],
          generationConfig: {
            response_mime_type: "application/json"
          }
        })
      });
      return res;
    }

    let response = await tryModel('gemini-2.5-flash');
    
    // Fallback logic for rate limits (429) or other transient errors
    if (response.status === 429 || !response.ok) {
       console.warn(`⚠️ Primary model failed (${response.status}). Falling back to modern flash lite...`);
       response = await tryModel('gemini-3.1-flash-lite-preview');
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    const resultText = data.candidates[0].content.parts[0].text;
    const resultJson = JSON.parse(resultText.replace(/```json/g, '').replace(/```/g, '').trim());

    return NextResponse.json(resultJson);
  } catch (err: any) {
    console.error('AI Parsing failed:', err);
    return NextResponse.json({ error: err.message || 'AI extraction failed. Try a different prompt.' }, { status: 500 });
  }
}
