import zxcvbn from 'zxcvbn';

// Minimum requirements
const MIN_PASSWORD_LENGTH = 12;
const MIN_ZXCVBN_SCORE = 3; // 0-4 scale, 3 = "safely unguessable"

export interface PasswordValidationResult {
  isValid: boolean;
  score: number; // 0-4
  errors: string[];
  suggestions: string[];
  strengthLabel: string;
}

// German strength labels
const STRENGTH_LABELS: Record<number, string> = {
  0: 'Sehr schwach',
  1: 'Schwach',
  2: 'Ausreichend',
  3: 'Stark',
  4: 'Sehr stark',
};

// German feedback translations
const FEEDBACK_TRANSLATIONS: Record<string, string> = {
  'Use a few words, avoid common phrases': 'Verwenden Sie mehrere Wörter, vermeiden Sie häufige Ausdrücke',
  'No need for symbols, digits, or uppercase letters': 'Symbole, Zahlen oder Grossbuchstaben sind nicht notwendig',
  'Add another word or two. Uncommon words are better.': 'Fügen Sie ein oder zwei weitere Wörter hinzu. Ungewöhnliche Wörter sind besser.',
  'Straight rows of keys are easy to guess': 'Tastenreihen sind leicht zu erraten',
  'Short keyboard patterns are easy to guess': 'Kurze Tastaturmuster sind leicht zu erraten',
  'Use a longer keyboard pattern with more turns': 'Verwenden Sie ein längeres Tastaturmuster mit mehr Richtungswechseln',
  'Repeats like "aaa" are easy to guess': 'Wiederholungen wie "aaa" sind leicht zu erraten',
  'Repeats like "abcabcabc" are only slightly harder to guess than "abc"': 'Wiederholungen wie "abcabcabc" sind nur etwas schwerer zu erraten als "abc"',
  'Avoid repeated words and characters': 'Vermeiden Sie wiederholte Wörter und Zeichen',
  'Sequences like abc or 6543 are easy to guess': 'Sequenzen wie abc oder 6543 sind leicht zu erraten',
  'Avoid sequences': 'Vermeiden Sie Sequenzen',
  'Recent years are easy to guess': 'Aktuelle Jahre sind leicht zu erraten',
  'Avoid recent years': 'Vermeiden Sie aktuelle Jahre',
  'Avoid years that are associated with you': 'Vermeiden Sie Jahre, die mit Ihnen in Verbindung stehen',
  'Dates are often easy to guess': 'Daten sind oft leicht zu erraten',
  'Avoid dates and years that are associated with you': 'Vermeiden Sie Daten und Jahre, die mit Ihnen in Verbindung stehen',
  'This is a top-10 common password': 'Dies ist eines der 10 häufigsten Passwörter',
  'This is a top-100 common password': 'Dies ist eines der 100 häufigsten Passwörter',
  'This is a very common password': 'Dies ist ein sehr häufiges Passwort',
  'This is similar to a commonly used password': 'Dies ähnelt einem häufig verwendeten Passwort',
  'A word by itself is easy to guess': 'Ein einzelnes Wort ist leicht zu erraten',
  'Names and surnames by themselves are easy to guess': 'Namen und Nachnamen allein sind leicht zu erraten',
  'Common names and surnames are easy to guess': 'Gebräuchliche Namen und Nachnamen sind leicht zu erraten',
  "Capitalization doesn't help very much": 'Grossschreibung hilft nicht viel',
  'All-uppercase is almost as easy to guess as all-lowercase': 'Nur Grossbuchstaben sind fast so leicht zu erraten wie nur Kleinbuchstaben',
  "Reversed words aren't much harder to guess": 'Umgekehrte Wörter sind nicht viel schwerer zu erraten',
  "Predictable substitutions like '@' instead of 'a' don't help very much": "Vorhersehbare Ersetzungen wie '@' statt 'a' helfen nicht viel",
};

/**
 * Translate zxcvbn feedback to German
 */
function translateFeedback(feedback: string): string {
  return FEEDBACK_TRANSLATIONS[feedback] || feedback;
}

/**
 * Validate password strength using zxcvbn
 * @param password The password to validate
 * @param userInputs Additional strings to penalize (e.g., username, email)
 */
export function validatePassword(
  password: string,
  userInputs: string[] = []
): PasswordValidationResult {
  const errors: string[] = [];
  const suggestions: string[] = [];

  // Check minimum length
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen erforderlich`);
  }

  // Run zxcvbn analysis
  const result = zxcvbn(password, userInputs);
  const score = result.score;

  // Check score requirement
  if (score < MIN_ZXCVBN_SCORE) {
    errors.push('Passwort ist nicht stark genug');
  }

  // Add translated suggestions from zxcvbn
  if (result.feedback.warning) {
    suggestions.push(translateFeedback(result.feedback.warning));
  }

  result.feedback.suggestions.forEach((suggestion) => {
    suggestions.push(translateFeedback(suggestion));
  });

  // Add default suggestions if none provided
  if (suggestions.length === 0 && score < MIN_ZXCVBN_SCORE) {
    suggestions.push('Verwenden Sie eine Kombination aus Wörtern, Zahlen und Sonderzeichen');
    suggestions.push('Vermeiden Sie persönliche Informationen');
    suggestions.push('Verwenden Sie mindestens 12 Zeichen');
  }

  return {
    isValid: errors.length === 0,
    score,
    errors,
    suggestions,
    strengthLabel: STRENGTH_LABELS[score],
  };
}

/**
 * Get password strength information for UI display
 */
export function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
  percentage: number;
} {
  if (!password) {
    return { score: 0, label: '', color: 'gray', percentage: 0 };
  }

  const result = zxcvbn(password);
  const score = result.score;

  const colors: Record<number, string> = {
    0: 'red',
    1: 'orange',
    2: 'yellow',
    3: 'lime',
    4: 'green',
  };

  return {
    score,
    label: STRENGTH_LABELS[score],
    color: colors[score],
    percentage: (score + 1) * 20,
  };
}

/**
 * Validate username format
 */
export function validateUsername(username: string): {
  isValid: boolean;
  error?: string;
} {
  if (!username) {
    return { isValid: false, error: 'Benutzername ist erforderlich' };
  }

  if (username.length < 3) {
    return { isValid: false, error: 'Benutzername muss mindestens 3 Zeichen haben' };
  }

  if (username.length > 50) {
    return { isValid: false, error: 'Benutzername darf maximal 50 Zeichen haben' };
  }

  // Only allow alphanumeric, dots, underscores, hyphens
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return {
      isValid: false,
      error: 'Benutzername darf nur Buchstaben, Zahlen, Punkte, Unterstriche und Bindestriche enthalten',
    };
  }

  // Must start with a letter
  if (!/^[a-zA-Z]/.test(username)) {
    return { isValid: false, error: 'Benutzername muss mit einem Buchstaben beginnen' };
  }

  return { isValid: true };
}
