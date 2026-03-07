import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const SUPPORTED_LOCALES = ['de-CH', 'de-DE', 'en', 'hr', 'sr', 'bs', 'sl', 'mk', 'sq', 'es', 'pt', 'fr', 'it'] as const;

const NEAR_AI_URL = 'https://cloud-api.near.ai/v1';
const NEAR_AI_KEY = process.env.NEAR_AI_API_KEY || 'sk-f8b3cad314574234b9ad8ac39cc5c016';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set() {},
          remove() {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { items } = body as { items: { id: string; label: string }[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Items array is required' }, { status: 400 });
    }

    // Build a single prompt that translates all items to all locales at once
    const itemsList = items.map((item, i) => `${i + 1}. ${item.label}`).join('\n');
    const localesList = SUPPORTED_LOCALES.join(', ');

    const response = await fetch(`${NEAR_AI_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NEAR_AI_KEY}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          {
            role: 'system',
            content: `You are a professional translator for facility management software. You will receive checklist items that may each be in a different language. Auto-detect the language of each item individually.

Translate ALL items to ALL of these locales: ${localesList}

Locale details:
- de-CH: German (Switzerland)
- de-DE: German (Germany)
- en: English
- hr: Croatian
- sr: Serbian (Latin script)
- bs: Bosnian
- sl: Slovenian
- mk: Macedonian (Cyrillic script)
- sq: Albanian
- es: Spanish
- pt: Brazilian Portuguese
- fr: French
- it: Italian

Return ONLY valid JSON in this exact format, no markdown, no explanation:
{
  "0": {"de-CH": "...", "de-DE": "...", "en": "...", "hr": "...", "sr": "...", "bs": "...", "sl": "...", "mk": "...", "sq": "...", "es": "...", "pt": "...", "fr": "...", "it": "..."},
  "1": {"de-CH": "...", ...}
}

Keys are zero-based item indices. Values are the translated strings.`,
          },
          {
            role: 'user',
            content: itemsList,
          },
        ],
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Near AI API error:', response.status, errText);
      throw new Error(`Near AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON response - strip markdown code fences if present
    const jsonStr = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    let parsed: Record<string, Record<string, string>>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('Failed to parse translation JSON:', jsonStr);
      throw new Error('Failed to parse translation response');
    }

    // Restructure: { itemId: { locale: translation } }
    const translatedItems: Record<string, Record<string, string>> = {};
    for (let i = 0; i < items.length; i++) {
      const itemTranslations = parsed[String(i)] || {};
      translatedItems[items[i].id] = {};
      for (const locale of SUPPORTED_LOCALES) {
        translatedItems[items[i].id][locale] = itemTranslations[locale] || items[i].label;
      }
    }

    return NextResponse.json({ translations: translatedItems });
  } catch (error: any) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: error?.message || 'Translation failed' },
      { status: 500 }
    );
  }
}
