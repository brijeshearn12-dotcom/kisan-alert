/**
 * Centralized translation foundation — the single source of truth.
 * -----------------------------------------------------------------------------
 * This module owns every UI string the app can show, in every supported
 * language. Nothing else in the codebase should hardcode user-facing copy or
 * know how translation works internally — components consume it exclusively via
 * `useLanguage().t(key)` (see `contexts/LanguageContext.tsx`).
 *
 * Design goals (Phase 1 foundation):
 *   • O(1) lookup — flat dotted keys, no per-render object construction.
 *   • Type-safe — `TranslationKey` is derived from the English dictionary, so a
 *     typo in a key is a compile error and every language must stay complete.
 *   • Graceful — a missing key falls back to English, then to the key itself;
 *     it never renders `undefined` and never throws.
 *   • Extensible — adding a language means editing THIS FILE ONLY: add a code to
 *     `LANGUAGES`, add a dictionary, and register it in `translations`.
 *
 * Keys are grouped into human-readable sections (common, navigation, weather…)
 * using a `section.name` convention so future pages can find copy by feature.
 */

// ── Supported languages ──────────────────────────────────────────────────────

/** Every language code the UI can render. Extend here to add a language. */
export type LanguageCode =
  | 'en'
  | 'hi'
  | 'mr'
  | 'gu'
  | 'kn'
  | 'ta'
  | 'te'
  | 'bn'

/** Presentation metadata for the language selector. */
export interface LanguageMeta {
  /** BCP-47-ish short code used everywhere internally. */
  code: LanguageCode
  /** Native-script label shown to the user (e.g. "हिन्दी"). */
  label: string
  /** English name, handy for menus / accessibility. */
  englishLabel: string
  /** Emoji flag — no image assets required. */
  flag: string
  /** Text direction; `'rtl'` for future right-to-left languages. */
  dir: 'ltr' | 'rtl'
  /** BCP-47 locale for speech (TTS/STT), e.g. "hi-IN". */
  locale: string
}

/**
 * Ordered list backing the language selector and `availableLanguages`.
 * The order here is the order shown in the UI.
 */
export const LANGUAGES: readonly LanguageMeta[] = [
  { code: 'en', label: 'English', englishLabel: 'English', flag: '🇬🇧', dir: 'ltr', locale: 'en-IN' },
  { code: 'hi', label: 'हिन्दी', englishLabel: 'Hindi', flag: '🇮🇳', dir: 'ltr', locale: 'hi-IN' },
  { code: 'mr', label: 'मराठी', englishLabel: 'Marathi', flag: '🇮🇳', dir: 'ltr', locale: 'mr-IN' },
  { code: 'gu', label: 'ગુજરાતી', englishLabel: 'Gujarati', flag: '🇮🇳', dir: 'ltr', locale: 'gu-IN' },
  { code: 'kn', label: 'ಕನ್ನಡ', englishLabel: 'Kannada', flag: '🇮🇳', dir: 'ltr', locale: 'kn-IN' },
  { code: 'ta', label: 'தமிழ்', englishLabel: 'Tamil', flag: '🇮🇳', dir: 'ltr', locale: 'ta-IN' },
  { code: 'te', label: 'తెలుగు', englishLabel: 'Telugu', flag: '🇮🇳', dir: 'ltr', locale: 'te-IN' },
  { code: 'bn', label: 'বাংলা', englishLabel: 'Bengali', flag: '🇮🇳', dir: 'ltr', locale: 'bn-IN' },
] as const

/** Codes that render right-to-left. Empty today; the plumbing is ready. */
export const RTL_LANGUAGES: ReadonlySet<LanguageCode> = new Set<LanguageCode>()

/** Fast membership check for narrowing untrusted strings (localStorage, query). */
const LANGUAGE_CODES: ReadonlySet<string> = new Set(LANGUAGES.map((l) => l.code))

/** Default / base language. Everything falls back to this. */
export const DEFAULT_LANGUAGE: LanguageCode = 'en'

/** Narrow an arbitrary value to a supported `LanguageCode`. */
export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && LANGUAGE_CODES.has(value)
}

/** Look up a language's metadata; falls back to the default language. */
export function getLanguageMeta(code: LanguageCode): LanguageMeta {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]
}

// ── English dictionary (canonical source of truth) ───────────────────────────
//
// English defines the complete key set. `TranslationKey` is derived from it, so
// every other language is type-checked to contain exactly these keys.

const en = {
  // common —— shared, app-wide copy
  'common.appName': 'Kisan Alert',
  'common.tagline': 'AI Crop Advisory',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.ok': 'OK',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.retry': 'Retry',
  'common.optional': 'Optional',

  // navigation —— nav bar / menu entries
  'navigation.home': 'Home',
  'navigation.dashboard': 'Dashboard',
  'navigation.recommendation': 'Recommendation',
  'navigation.weather': 'Weather',
  'navigation.disease': 'Disease Check',
  'navigation.history': 'History',
  'navigation.expert': 'Expert Consultation',
  'navigation.profile': 'Profile',
  'navigation.logout': 'Log out',

  // buttons —— reusable action labels
  'buttons.submit': 'Submit',
  'buttons.save': 'Save',
  'buttons.delete': 'Delete',
  'buttons.edit': 'Edit',
  'buttons.getRecommendation': 'Get Recommendation',
  'buttons.listen': 'Listen',
  'buttons.upload': 'Upload',
  'buttons.tryAgain': 'Try again',

  // dashboard
  'dashboard.title': 'Dashboard',
  'dashboard.welcome': 'Welcome back',
  'dashboard.subtitle': 'Your farm at a glance',

  // weather
  'weather.title': 'Weather',
  'weather.temperature': 'Temperature',
  'weather.humidity': 'Humidity',
  'weather.rainfall': 'Rainfall',
  'weather.wind': 'Wind',
  'weather.forecast': 'Forecast',
  'weather.drySpell': 'Dry spell detected',

  // recommendation
  'recommendation.title': 'Crop Recommendation',
  'recommendation.selectDistrict': 'Select district',
  'recommendation.selectSoil': 'Select soil type',
  'recommendation.confidence': 'Confidence',
  'recommendation.reasoning': 'Reasoning',
  'recommendation.fertilizationTip': 'Fertilization tip',
  'recommendation.irrigationAdvice': 'Irrigation advice',

  // disease
  'disease.title': 'Disease Check',
  'disease.uploadPhoto': 'Upload a photo of the crop',
  'disease.diagnosis': 'Diagnosis',
  'disease.treatment': 'Treatment',

  // history
  'history.title': 'History',
  'history.empty': 'No past recommendations yet',

  // expert
  'expert.title': 'Expert Consultation',
  'expert.askQuestion': 'Ask a question',

  // profile
  'profile.title': 'Profile',
  'profile.language': 'Language',
  'profile.district': 'District',

  // voice —— voice input / TTS controls
  'voice.start': 'Start speaking',
  'voice.stop': 'Stop',
  'voice.listening': 'Listening…',
  'voice.processing': 'Processing…',

  // forms
  'forms.required': 'This field is required',
  'forms.email': 'Email',
  'forms.password': 'Password',

  // validation
  'validation.required': 'Required',
  'validation.invalidEmail': 'Enter a valid email',

  // errors
  'errors.generic': 'Something went wrong',
  'errors.network': 'Network error. Check your connection.',
  'errors.notFound': 'Not found',
  'errors.unauthorized': 'Please log in to continue',

  // loading
  'loading.default': 'Loading…',
  'loading.recommendation': 'Generating your recommendation…',

  // success
  'success.saved': 'Saved successfully',
  'success.updated': 'Updated successfully',

  // dialogs
  'dialogs.confirmTitle': 'Are you sure?',
  'dialogs.confirmDelete': 'This action cannot be undone.',

  // tooltips
  'tooltips.listen': 'Listen to this text',
  'tooltips.changeLanguage': 'Change language',

  // empty —— empty-state copy
  'empty.noData': 'No data available',
  'empty.noResults': 'No results found',
} as const satisfies Record<string, string>

/**
 * Every valid translation key. Derived from English, so `t('foo.bar')` with an
 * unknown key is a compile-time error and translations can't silently drift.
 */
export type TranslationKey = keyof typeof en

/** A complete dictionary for one language. Enforces full key coverage. */
export type Dictionary = Record<TranslationKey, string>

// ── Other languages ──────────────────────────────────────────────────────────
//
// Each is typed as `Dictionary`, so TypeScript flags any missing or misspelled
// key. Translations should be reviewed by native speakers before launch.

const hi: Dictionary = {
  'common.appName': 'किसान अलर्ट',
  'common.tagline': 'एआई फसल सलाह',
  'common.yes': 'हाँ',
  'common.no': 'नहीं',
  'common.ok': 'ठीक है',
  'common.cancel': 'रद्द करें',
  'common.close': 'बंद करें',
  'common.back': 'वापस',
  'common.next': 'आगे',
  'common.retry': 'पुनः प्रयास करें',
  'common.optional': 'वैकल्पिक',
  'navigation.home': 'होम',
  'navigation.dashboard': 'डैशबोर्ड',
  'navigation.recommendation': 'सिफ़ारिश',
  'navigation.weather': 'मौसम',
  'navigation.disease': 'रोग जाँच',
  'navigation.history': 'इतिहास',
  'navigation.expert': 'विशेषज्ञ परामर्श',
  'navigation.profile': 'प्रोफ़ाइल',
  'navigation.logout': 'लॉग आउट',
  'buttons.submit': 'जमा करें',
  'buttons.save': 'सहेजें',
  'buttons.delete': 'हटाएँ',
  'buttons.edit': 'संपादित करें',
  'buttons.getRecommendation': 'सिफ़ारिश प्राप्त करें',
  'buttons.listen': 'सुनें',
  'buttons.upload': 'अपलोड करें',
  'buttons.tryAgain': 'फिर से प्रयास करें',
  'dashboard.title': 'डैशबोर्ड',
  'dashboard.welcome': 'वापसी पर स्वागत है',
  'dashboard.subtitle': 'आपका खेत एक नज़र में',
  'weather.title': 'मौसम',
  'weather.temperature': 'तापमान',
  'weather.humidity': 'नमी',
  'weather.rainfall': 'वर्षा',
  'weather.wind': 'हवा',
  'weather.forecast': 'पूर्वानुमान',
  'weather.drySpell': 'सूखा पड़ने की संभावना',
  'recommendation.title': 'फसल सिफ़ारिश',
  'recommendation.selectDistrict': 'ज़िला चुनें',
  'recommendation.selectSoil': 'मिट्टी का प्रकार चुनें',
  'recommendation.confidence': 'विश्वास स्तर',
  'recommendation.reasoning': 'कारण',
  'recommendation.fertilizationTip': 'उर्वरक सुझाव',
  'recommendation.irrigationAdvice': 'सिंचाई सलाह',
  'disease.title': 'रोग जाँच',
  'disease.uploadPhoto': 'फसल की तस्वीर अपलोड करें',
  'disease.diagnosis': 'निदान',
  'disease.treatment': 'उपचार',
  'history.title': 'इतिहास',
  'history.empty': 'अभी तक कोई पिछली सिफ़ारिश नहीं',
  'expert.title': 'विशेषज्ञ परामर्श',
  'expert.askQuestion': 'प्रश्न पूछें',
  'profile.title': 'प्रोफ़ाइल',
  'profile.language': 'भाषा',
  'profile.district': 'ज़िला',
  'voice.start': 'बोलना शुरू करें',
  'voice.stop': 'रोकें',
  'voice.listening': 'सुन रहे हैं…',
  'voice.processing': 'प्रोसेस हो रहा है…',
  'forms.required': 'यह फ़ील्ड आवश्यक है',
  'forms.email': 'ईमेल',
  'forms.password': 'पासवर्ड',
  'validation.required': 'आवश्यक',
  'validation.invalidEmail': 'मान्य ईमेल दर्ज करें',
  'errors.generic': 'कुछ गलत हो गया',
  'errors.network': 'नेटवर्क त्रुटि। अपना कनेक्शन जाँचें।',
  'errors.notFound': 'नहीं मिला',
  'errors.unauthorized': 'जारी रखने के लिए लॉग इन करें',
  'loading.default': 'लोड हो रहा है…',
  'loading.recommendation': 'आपकी सिफ़ारिश तैयार हो रही है…',
  'success.saved': 'सफलतापूर्वक सहेजा गया',
  'success.updated': 'सफलतापूर्वक अपडेट किया गया',
  'dialogs.confirmTitle': 'क्या आप निश्चित हैं?',
  'dialogs.confirmDelete': 'यह क्रिया पूर्ववत नहीं की जा सकती।',
  'tooltips.listen': 'इस पाठ को सुनें',
  'tooltips.changeLanguage': 'भाषा बदलें',
  'empty.noData': 'कोई डेटा उपलब्ध नहीं',
  'empty.noResults': 'कोई परिणाम नहीं मिला',
}

const mr: Dictionary = {
  'common.appName': 'किसान अलर्ट',
  'common.tagline': 'एआय पीक सल्ला',
  'common.yes': 'होय',
  'common.no': 'नाही',
  'common.ok': 'ठीक आहे',
  'common.cancel': 'रद्द करा',
  'common.close': 'बंद करा',
  'common.back': 'मागे',
  'common.next': 'पुढे',
  'common.retry': 'पुन्हा प्रयत्न करा',
  'common.optional': 'पर्यायी',
  'navigation.home': 'मुख्यपृष्ठ',
  'navigation.dashboard': 'डॅशबोर्ड',
  'navigation.recommendation': 'शिफारस',
  'navigation.weather': 'हवामान',
  'navigation.disease': 'रोग तपासणी',
  'navigation.history': 'इतिहास',
  'navigation.expert': 'तज्ज्ञ सल्ला',
  'navigation.profile': 'प्रोफाइल',
  'navigation.logout': 'लॉग आउट',
  'buttons.submit': 'सबमिट करा',
  'buttons.save': 'जतन करा',
  'buttons.delete': 'हटवा',
  'buttons.edit': 'संपादित करा',
  'buttons.getRecommendation': 'शिफारस मिळवा',
  'buttons.listen': 'ऐका',
  'buttons.upload': 'अपलोड करा',
  'buttons.tryAgain': 'पुन्हा प्रयत्न करा',
  'dashboard.title': 'डॅशबोर्ड',
  'dashboard.welcome': 'पुन्हा स्वागत आहे',
  'dashboard.subtitle': 'तुमचे शेत एका दृष्टीक्षेपात',
  'weather.title': 'हवामान',
  'weather.temperature': 'तापमान',
  'weather.humidity': 'आर्द्रता',
  'weather.rainfall': 'पाऊस',
  'weather.wind': 'वारा',
  'weather.forecast': 'अंदाज',
  'weather.drySpell': 'कोरडा कालावधी आढळला',
  'recommendation.title': 'पीक शिफारस',
  'recommendation.selectDistrict': 'जिल्हा निवडा',
  'recommendation.selectSoil': 'मातीचा प्रकार निवडा',
  'recommendation.confidence': 'विश्वास पातळी',
  'recommendation.reasoning': 'कारण',
  'recommendation.fertilizationTip': 'खत सल्ला',
  'recommendation.irrigationAdvice': 'सिंचन सल्ला',
  'disease.title': 'रोग तपासणी',
  'disease.uploadPhoto': 'पिकाचा फोटो अपलोड करा',
  'disease.diagnosis': 'निदान',
  'disease.treatment': 'उपचार',
  'history.title': 'इतिहास',
  'history.empty': 'अद्याप कोणतीही मागील शिफारस नाही',
  'expert.title': 'तज्ज्ञ सल्ला',
  'expert.askQuestion': 'प्रश्न विचारा',
  'profile.title': 'प्रोफाइल',
  'profile.language': 'भाषा',
  'profile.district': 'जिल्हा',
  'voice.start': 'बोलणे सुरू करा',
  'voice.stop': 'थांबा',
  'voice.listening': 'ऐकत आहे…',
  'voice.processing': 'प्रक्रिया सुरू आहे…',
  'forms.required': 'हे क्षेत्र आवश्यक आहे',
  'forms.email': 'ईमेल',
  'forms.password': 'पासवर्ड',
  'validation.required': 'आवश्यक',
  'validation.invalidEmail': 'वैध ईमेल प्रविष्ट करा',
  'errors.generic': 'काहीतरी चूक झाली',
  'errors.network': 'नेटवर्क त्रुटी. तुमचे कनेक्शन तपासा.',
  'errors.notFound': 'सापडले नाही',
  'errors.unauthorized': 'सुरू ठेवण्यासाठी लॉग इन करा',
  'loading.default': 'लोड होत आहे…',
  'loading.recommendation': 'तुमची शिफारस तयार होत आहे…',
  'success.saved': 'यशस्वीरित्या जतन केले',
  'success.updated': 'यशस्वीरित्या अद्यतनित केले',
  'dialogs.confirmTitle': 'तुम्हाला खात्री आहे का?',
  'dialogs.confirmDelete': 'ही क्रिया पूर्ववत करता येणार नाही.',
  'tooltips.listen': 'हा मजकूर ऐका',
  'tooltips.changeLanguage': 'भाषा बदला',
  'empty.noData': 'कोणताही डेटा उपलब्ध नाही',
  'empty.noResults': 'कोणतेही परिणाम आढळले नाहीत',
}

const gu: Dictionary = {
  'common.appName': 'કિસાન અલર્ટ',
  'common.tagline': 'એઆઈ પાક સલાહ',
  'common.yes': 'હા',
  'common.no': 'ના',
  'common.ok': 'બરાબર',
  'common.cancel': 'રદ કરો',
  'common.close': 'બંધ કરો',
  'common.back': 'પાછળ',
  'common.next': 'આગળ',
  'common.retry': 'ફરી પ્રયાસ કરો',
  'common.optional': 'વૈકલ્પિક',
  'navigation.home': 'હોમ',
  'navigation.dashboard': 'ડેશબોર્ડ',
  'navigation.recommendation': 'ભલામણ',
  'navigation.weather': 'હવામાન',
  'navigation.disease': 'રોગ તપાસ',
  'navigation.history': 'ઇતિહાસ',
  'navigation.expert': 'નિષ્ણાત સલાહ',
  'navigation.profile': 'પ્રોફાઇલ',
  'navigation.logout': 'લોગ આઉટ',
  'buttons.submit': 'સબમિટ કરો',
  'buttons.save': 'સાચવો',
  'buttons.delete': 'કાઢી નાખો',
  'buttons.edit': 'સંપાદિત કરો',
  'buttons.getRecommendation': 'ભલામણ મેળવો',
  'buttons.listen': 'સાંભળો',
  'buttons.upload': 'અપલોડ કરો',
  'buttons.tryAgain': 'ફરી પ્રયાસ કરો',
  'dashboard.title': 'ડેશબોર્ડ',
  'dashboard.welcome': 'પાછા સ્વાગત છે',
  'dashboard.subtitle': 'તમારું ખેતર એક નજરમાં',
  'weather.title': 'હવામાન',
  'weather.temperature': 'તાપમાન',
  'weather.humidity': 'ભેજ',
  'weather.rainfall': 'વરસાદ',
  'weather.wind': 'પવન',
  'weather.forecast': 'આગાહી',
  'weather.drySpell': 'સૂકો સમયગાળો જોવા મળ્યો',
  'recommendation.title': 'પાક ભલામણ',
  'recommendation.selectDistrict': 'જિલ્લો પસંદ કરો',
  'recommendation.selectSoil': 'જમીનનો પ્રકાર પસંદ કરો',
  'recommendation.confidence': 'વિશ્વાસ સ્તર',
  'recommendation.reasoning': 'કારણ',
  'recommendation.fertilizationTip': 'ખાતર સૂચન',
  'recommendation.irrigationAdvice': 'સિંચાઈ સલાહ',
  'disease.title': 'રોગ તપાસ',
  'disease.uploadPhoto': 'પાકનો ફોટો અપલોડ કરો',
  'disease.diagnosis': 'નિદાન',
  'disease.treatment': 'સારવાર',
  'history.title': 'ઇતિહાસ',
  'history.empty': 'હજી સુધી કોઈ અગાઉની ભલામણ નથી',
  'expert.title': 'નિષ્ણાત સલાહ',
  'expert.askQuestion': 'પ્રશ્ન પૂછો',
  'profile.title': 'પ્રોફાઇલ',
  'profile.language': 'ભાષા',
  'profile.district': 'જિલ્લો',
  'voice.start': 'બોલવાનું શરૂ કરો',
  'voice.stop': 'રોકો',
  'voice.listening': 'સાંભળી રહ્યું છે…',
  'voice.processing': 'પ્રક્રિયા ચાલુ છે…',
  'forms.required': 'આ ફીલ્ડ આવશ્યક છે',
  'forms.email': 'ઇમેઇલ',
  'forms.password': 'પાસવર્ડ',
  'validation.required': 'આવશ્યક',
  'validation.invalidEmail': 'માન્ય ઇમેઇલ દાખલ કરો',
  'errors.generic': 'કંઈક ખોટું થયું',
  'errors.network': 'નેટવર્ક ભૂલ. તમારું કનેક્શન તપાસો.',
  'errors.notFound': 'મળ્યું નથી',
  'errors.unauthorized': 'ચાલુ રાખવા માટે લોગ ઇન કરો',
  'loading.default': 'લોડ થઈ રહ્યું છે…',
  'loading.recommendation': 'તમારી ભલામણ તૈયાર થઈ રહી છે…',
  'success.saved': 'સફળતાપૂર્વક સાચવ્યું',
  'success.updated': 'સફળતાપૂર્વક અપડેટ કર્યું',
  'dialogs.confirmTitle': 'શું તમને ખાતરી છે?',
  'dialogs.confirmDelete': 'આ ક્રિયા પૂર્વવત્ કરી શકાતી નથી.',
  'tooltips.listen': 'આ લખાણ સાંભળો',
  'tooltips.changeLanguage': 'ભાષા બદલો',
  'empty.noData': 'કોઈ ડેટા ઉપલબ્ધ નથી',
  'empty.noResults': 'કોઈ પરિણામ મળ્યું નથી',
}

const kn: Dictionary = {
  'common.appName': 'ಕಿಸಾನ್ ಅಲರ್ಟ್',
  'common.tagline': 'ಎಐ ಬೆಳೆ ಸಲಹೆ',
  'common.yes': 'ಹೌದು',
  'common.no': 'ಇಲ್ಲ',
  'common.ok': 'ಸರಿ',
  'common.cancel': 'ರದ್ದುಮಾಡಿ',
  'common.close': 'ಮುಚ್ಚಿ',
  'common.back': 'ಹಿಂದೆ',
  'common.next': 'ಮುಂದೆ',
  'common.retry': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
  'common.optional': 'ಐಚ್ಛಿಕ',
  'navigation.home': 'ಮುಖಪುಟ',
  'navigation.dashboard': 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
  'navigation.recommendation': 'ಶಿಫಾರಸು',
  'navigation.weather': 'ಹವಾಮಾನ',
  'navigation.disease': 'ರೋಗ ಪರಿಶೀಲನೆ',
  'navigation.history': 'ಇತಿಹಾಸ',
  'navigation.expert': 'ತಜ್ಞರ ಸಲಹೆ',
  'navigation.profile': 'ಪ್ರೊಫೈಲ್',
  'navigation.logout': 'ಲಾಗ್ ಔಟ್',
  'buttons.submit': 'ಸಲ್ಲಿಸಿ',
  'buttons.save': 'ಉಳಿಸಿ',
  'buttons.delete': 'ಅಳಿಸಿ',
  'buttons.edit': 'ಸಂಪಾದಿಸಿ',
  'buttons.getRecommendation': 'ಶಿಫಾರಸು ಪಡೆಯಿರಿ',
  'buttons.listen': 'ಆಲಿಸಿ',
  'buttons.upload': 'ಅಪ್‌ಲೋಡ್ ಮಾಡಿ',
  'buttons.tryAgain': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
  'dashboard.title': 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
  'dashboard.welcome': 'ಮರಳಿ ಸ್ವಾಗತ',
  'dashboard.subtitle': 'ನಿಮ್ಮ ಹೊಲ ಒಂದೇ ನೋಟದಲ್ಲಿ',
  'weather.title': 'ಹವಾಮಾನ',
  'weather.temperature': 'ತಾಪಮಾನ',
  'weather.humidity': 'ಆರ್ದ್ರತೆ',
  'weather.rainfall': 'ಮಳೆ',
  'weather.wind': 'ಗಾಳಿ',
  'weather.forecast': 'ಮುನ್ಸೂಚನೆ',
  'weather.drySpell': 'ಶುಷ್ಕ ಅವಧಿ ಪತ್ತೆಯಾಗಿದೆ',
  'recommendation.title': 'ಬೆಳೆ ಶಿಫಾರಸು',
  'recommendation.selectDistrict': 'ಜಿಲ್ಲೆ ಆಯ್ಕೆಮಾಡಿ',
  'recommendation.selectSoil': 'ಮಣ್ಣಿನ ಪ್ರಕಾರ ಆಯ್ಕೆಮಾಡಿ',
  'recommendation.confidence': 'ವಿಶ್ವಾಸ ಮಟ್ಟ',
  'recommendation.reasoning': 'ಕಾರಣ',
  'recommendation.fertilizationTip': 'ಗೊಬ್ಬರ ಸಲಹೆ',
  'recommendation.irrigationAdvice': 'ನೀರಾವರಿ ಸಲಹೆ',
  'disease.title': 'ರೋಗ ಪರಿಶೀಲನೆ',
  'disease.uploadPhoto': 'ಬೆಳೆಯ ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ',
  'disease.diagnosis': 'ರೋಗನಿರ್ಣಯ',
  'disease.treatment': 'ಚಿಕಿತ್ಸೆ',
  'history.title': 'ಇತಿಹಾಸ',
  'history.empty': 'ಇನ್ನೂ ಯಾವುದೇ ಹಿಂದಿನ ಶಿಫಾರಸುಗಳಿಲ್ಲ',
  'expert.title': 'ತಜ್ಞರ ಸಲಹೆ',
  'expert.askQuestion': 'ಪ್ರಶ್ನೆ ಕೇಳಿ',
  'profile.title': 'ಪ್ರೊಫೈಲ್',
  'profile.language': 'ಭಾಷೆ',
  'profile.district': 'ಜಿಲ್ಲೆ',
  'voice.start': 'ಮಾತನಾಡಲು ಪ್ರಾರಂಭಿಸಿ',
  'voice.stop': 'ನಿಲ್ಲಿಸಿ',
  'voice.listening': 'ಆಲಿಸುತ್ತಿದೆ…',
  'voice.processing': 'ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಲಾಗುತ್ತಿದೆ…',
  'forms.required': 'ಈ ಕ್ಷೇತ್ರ ಅಗತ್ಯವಿದೆ',
  'forms.email': 'ಇಮೇಲ್',
  'forms.password': 'ಪಾಸ್‌ವರ್ಡ್',
  'validation.required': 'ಅಗತ್ಯವಿದೆ',
  'validation.invalidEmail': 'ಮಾನ್ಯ ಇಮೇಲ್ ನಮೂದಿಸಿ',
  'errors.generic': 'ಏನೋ ತಪ್ಪಾಗಿದೆ',
  'errors.network': 'ನೆಟ್‌ವರ್ಕ್ ದೋಷ. ನಿಮ್ಮ ಸಂಪರ್ಕ ಪರಿಶೀಲಿಸಿ.',
  'errors.notFound': 'ಕಂಡುಬಂದಿಲ್ಲ',
  'errors.unauthorized': 'ಮುಂದುವರಿಯಲು ಲಾಗ್ ಇನ್ ಮಾಡಿ',
  'loading.default': 'ಲೋಡ್ ಆಗುತ್ತಿದೆ…',
  'loading.recommendation': 'ನಿಮ್ಮ ಶಿಫಾರಸು ಸಿದ್ಧವಾಗುತ್ತಿದೆ…',
  'success.saved': 'ಯಶಸ್ವಿಯಾಗಿ ಉಳಿಸಲಾಗಿದೆ',
  'success.updated': 'ಯಶಸ್ವಿಯಾಗಿ ನವೀಕರಿಸಲಾಗಿದೆ',
  'dialogs.confirmTitle': 'ನಿಮಗೆ ಖಚಿತವೇ?',
  'dialogs.confirmDelete': 'ಈ ಕ್ರಿಯೆಯನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗುವುದಿಲ್ಲ.',
  'tooltips.listen': 'ಈ ಪಠ್ಯವನ್ನು ಆಲಿಸಿ',
  'tooltips.changeLanguage': 'ಭಾಷೆ ಬದಲಾಯಿಸಿ',
  'empty.noData': 'ಯಾವುದೇ ಡೇಟಾ ಲಭ್ಯವಿಲ್ಲ',
  'empty.noResults': 'ಯಾವುದೇ ಫಲಿತಾಂಶಗಳು ಕಂಡುಬಂದಿಲ್ಲ',
}

const ta: Dictionary = {
  'common.appName': 'கிசான் அலெர்ட்',
  'common.tagline': 'ஏஐ பயிர் ஆலோசனை',
  'common.yes': 'ஆம்',
  'common.no': 'இல்லை',
  'common.ok': 'சரி',
  'common.cancel': 'ரத்து செய்',
  'common.close': 'மூடு',
  'common.back': 'பின்',
  'common.next': 'அடுத்து',
  'common.retry': 'மீண்டும் முயற்சி செய்',
  'common.optional': 'விருப்பத்தேர்வு',
  'navigation.home': 'முகப்பு',
  'navigation.dashboard': 'டாஷ்போர்டு',
  'navigation.recommendation': 'பரிந்துரை',
  'navigation.weather': 'வானிலை',
  'navigation.disease': 'நோய் சரிபார்ப்பு',
  'navigation.history': 'வரலாறு',
  'navigation.expert': 'நிபுணர் ஆலோசனை',
  'navigation.profile': 'சுயவிவரம்',
  'navigation.logout': 'வெளியேறு',
  'buttons.submit': 'சமர்ப்பி',
  'buttons.save': 'சேமி',
  'buttons.delete': 'நீக்கு',
  'buttons.edit': 'திருத்து',
  'buttons.getRecommendation': 'பரிந்துரையைப் பெறு',
  'buttons.listen': 'கேள்',
  'buttons.upload': 'பதிவேற்று',
  'buttons.tryAgain': 'மீண்டும் முயற்சி செய்',
  'dashboard.title': 'டாஷ்போர்டு',
  'dashboard.welcome': 'மீண்டும் வரவேற்கிறோம்',
  'dashboard.subtitle': 'உங்கள் பண்ணை ஒரே பார்வையில்',
  'weather.title': 'வானிலை',
  'weather.temperature': 'வெப்பநிலை',
  'weather.humidity': 'ஈரப்பதம்',
  'weather.rainfall': 'மழை',
  'weather.wind': 'காற்று',
  'weather.forecast': 'முன்னறிவிப்பு',
  'weather.drySpell': 'வறட்சி காலம் கண்டறியப்பட்டது',
  'recommendation.title': 'பயிர் பரிந்துரை',
  'recommendation.selectDistrict': 'மாவட்டத்தைத் தேர்ந்தெடு',
  'recommendation.selectSoil': 'மண் வகையைத் தேர்ந்தெடு',
  'recommendation.confidence': 'நம்பிக்கை நிலை',
  'recommendation.reasoning': 'காரணம்',
  'recommendation.fertilizationTip': 'உர ஆலோசனை',
  'recommendation.irrigationAdvice': 'நீர்ப்பாசன ஆலோசனை',
  'disease.title': 'நோய் சரிபார்ப்பு',
  'disease.uploadPhoto': 'பயிரின் புகைப்படத்தை பதிவேற்று',
  'disease.diagnosis': 'நோய் கண்டறிதல்',
  'disease.treatment': 'சிகிச்சை',
  'history.title': 'வரலாறு',
  'history.empty': 'இதுவரை முந்தைய பரிந்துரைகள் இல்லை',
  'expert.title': 'நிபுணர் ஆலோசனை',
  'expert.askQuestion': 'கேள்வி கேள்',
  'profile.title': 'சுயவிவரம்',
  'profile.language': 'மொழி',
  'profile.district': 'மாவட்டம்',
  'voice.start': 'பேசத் தொடங்கு',
  'voice.stop': 'நிறுத்து',
  'voice.listening': 'கேட்கிறது…',
  'voice.processing': 'செயலாக்கப்படுகிறது…',
  'forms.required': 'இந்த புலம் அவசியம்',
  'forms.email': 'மின்னஞ்சல்',
  'forms.password': 'கடவுச்சொல்',
  'validation.required': 'அவசியம்',
  'validation.invalidEmail': 'செல்லுபடியாகும் மின்னஞ்சலை உள்ளிடு',
  'errors.generic': 'ஏதோ தவறு நடந்தது',
  'errors.network': 'பிணைய பிழை. உங்கள் இணைப்பைச் சரிபார்க்கவும்.',
  'errors.notFound': 'கண்டுபிடிக்கப்படவில்லை',
  'errors.unauthorized': 'தொடர உள்நுழையவும்',
  'loading.default': 'ஏற்றுகிறது…',
  'loading.recommendation': 'உங்கள் பரிந்துரை தயாராகிறது…',
  'success.saved': 'வெற்றிகரமாக சேமிக்கப்பட்டது',
  'success.updated': 'வெற்றிகரமாக புதுப்பிக்கப்பட்டது',
  'dialogs.confirmTitle': 'நீங்கள் உறுதியாக இருக்கிறீர்களா?',
  'dialogs.confirmDelete': 'இந்தச் செயலை மீட்டெடுக்க முடியாது.',
  'tooltips.listen': 'இந்த உரையைக் கேள்',
  'tooltips.changeLanguage': 'மொழியை மாற்று',
  'empty.noData': 'தரவு எதுவும் இல்லை',
  'empty.noResults': 'முடிவுகள் எதுவும் இல்லை',
}

const te: Dictionary = {
  'common.appName': 'కిసాన్ అలర్ట్',
  'common.tagline': 'ఏఐ పంట సలహా',
  'common.yes': 'అవును',
  'common.no': 'కాదు',
  'common.ok': 'సరే',
  'common.cancel': 'రద్దు చేయి',
  'common.close': 'మూసివేయి',
  'common.back': 'వెనుకకు',
  'common.next': 'తదుపరి',
  'common.retry': 'మళ్లీ ప్రయత్నించు',
  'common.optional': 'ఐచ్ఛికం',
  'navigation.home': 'హోమ్',
  'navigation.dashboard': 'డాష్‌బోర్డ్',
  'navigation.recommendation': 'సిఫార్సు',
  'navigation.weather': 'వాతావరణం',
  'navigation.disease': 'వ్యాధి తనిఖీ',
  'navigation.history': 'చరిత్ర',
  'navigation.expert': 'నిపుణుల సలహా',
  'navigation.profile': 'ప్రొఫైల్',
  'navigation.logout': 'లాగ్ అవుట్',
  'buttons.submit': 'సమర్పించు',
  'buttons.save': 'సేవ్ చేయి',
  'buttons.delete': 'తొలగించు',
  'buttons.edit': 'సవరించు',
  'buttons.getRecommendation': 'సిఫార్సు పొందండి',
  'buttons.listen': 'వినండి',
  'buttons.upload': 'అప్‌లోడ్ చేయి',
  'buttons.tryAgain': 'మళ్లీ ప్రయత్నించు',
  'dashboard.title': 'డాష్‌బోర్డ్',
  'dashboard.welcome': 'తిరిగి స్వాగతం',
  'dashboard.subtitle': 'మీ పొలం ఒక్క చూపులో',
  'weather.title': 'వాతావరణం',
  'weather.temperature': 'ఉష్ణోగ్రత',
  'weather.humidity': 'తేమ',
  'weather.rainfall': 'వర్షపాతం',
  'weather.wind': 'గాలి',
  'weather.forecast': 'సూచన',
  'weather.drySpell': 'పొడి కాలం గుర్తించబడింది',
  'recommendation.title': 'పంట సిఫార్సు',
  'recommendation.selectDistrict': 'జిల్లాను ఎంచుకోండి',
  'recommendation.selectSoil': 'నేల రకాన్ని ఎంచుకోండి',
  'recommendation.confidence': 'విశ్వాస స్థాయి',
  'recommendation.reasoning': 'కారణం',
  'recommendation.fertilizationTip': 'ఎరువుల సలహా',
  'recommendation.irrigationAdvice': 'నీటిపారుదల సలహా',
  'disease.title': 'వ్యాధి తనిఖీ',
  'disease.uploadPhoto': 'పంట ఫోటోను అప్‌లోడ్ చేయి',
  'disease.diagnosis': 'నిర్ధారణ',
  'disease.treatment': 'చికిత్స',
  'history.title': 'చరిత్ర',
  'history.empty': 'ఇంకా మునుపటి సిఫార్సులు లేవు',
  'expert.title': 'నిపుణుల సలహా',
  'expert.askQuestion': 'ప్రశ్న అడగండి',
  'profile.title': 'ప్రొఫైల్',
  'profile.language': 'భాష',
  'profile.district': 'జిల్లా',
  'voice.start': 'మాట్లాడటం ప్రారంభించండి',
  'voice.stop': 'ఆపు',
  'voice.listening': 'వింటోంది…',
  'voice.processing': 'ప్రాసెస్ అవుతోంది…',
  'forms.required': 'ఈ ఫీల్డ్ అవసరం',
  'forms.email': 'ఇమెయిల్',
  'forms.password': 'పాస్‌వర్డ్',
  'validation.required': 'అవసరం',
  'validation.invalidEmail': 'చెల్లుబాటు అయ్యే ఇమెయిల్ నమోదు చేయండి',
  'errors.generic': 'ఏదో తప్పు జరిగింది',
  'errors.network': 'నెట్‌వర్క్ లోపం. మీ కనెక్షన్ తనిఖీ చేయండి.',
  'errors.notFound': 'కనుగొనబడలేదు',
  'errors.unauthorized': 'కొనసాగించడానికి లాగిన్ చేయండి',
  'loading.default': 'లోడ్ అవుతోంది…',
  'loading.recommendation': 'మీ సిఫార్సు సిద్ధమవుతోంది…',
  'success.saved': 'విజయవంతంగా సేవ్ చేయబడింది',
  'success.updated': 'విజయవంతంగా నవీకరించబడింది',
  'dialogs.confirmTitle': 'మీరు ఖచ్చితంగా ఉన్నారా?',
  'dialogs.confirmDelete': 'ఈ చర్యను రద్దు చేయలేరు.',
  'tooltips.listen': 'ఈ వచనాన్ని వినండి',
  'tooltips.changeLanguage': 'భాషను మార్చండి',
  'empty.noData': 'డేటా అందుబాటులో లేదు',
  'empty.noResults': 'ఫలితాలు కనుగొనబడలేదు',
}

const bn: Dictionary = {
  'common.appName': 'কিসান অ্যালার্ট',
  'common.tagline': 'এআই ফসল পরামর্শ',
  'common.yes': 'হ্যাঁ',
  'common.no': 'না',
  'common.ok': 'ঠিক আছে',
  'common.cancel': 'বাতিল করুন',
  'common.close': 'বন্ধ করুন',
  'common.back': 'পিছনে',
  'common.next': 'পরবর্তী',
  'common.retry': 'আবার চেষ্টা করুন',
  'common.optional': 'ঐচ্ছিক',
  'navigation.home': 'হোম',
  'navigation.dashboard': 'ড্যাশবোর্ড',
  'navigation.recommendation': 'সুপারিশ',
  'navigation.weather': 'আবহাওয়া',
  'navigation.disease': 'রোগ পরীক্ষা',
  'navigation.history': 'ইতিহাস',
  'navigation.expert': 'বিশেষজ্ঞ পরামর্শ',
  'navigation.profile': 'প্রোফাইল',
  'navigation.logout': 'লগ আউট',
  'buttons.submit': 'জমা দিন',
  'buttons.save': 'সংরক্ষণ করুন',
  'buttons.delete': 'মুছুন',
  'buttons.edit': 'সম্পাদনা করুন',
  'buttons.getRecommendation': 'সুপারিশ পান',
  'buttons.listen': 'শুনুন',
  'buttons.upload': 'আপলোড করুন',
  'buttons.tryAgain': 'আবার চেষ্টা করুন',
  'dashboard.title': 'ড্যাশবোর্ড',
  'dashboard.welcome': 'আবার স্বাগতম',
  'dashboard.subtitle': 'এক নজরে আপনার খামার',
  'weather.title': 'আবহাওয়া',
  'weather.temperature': 'তাপমাত্রা',
  'weather.humidity': 'আর্দ্রতা',
  'weather.rainfall': 'বৃষ্টিপাত',
  'weather.wind': 'বাতাস',
  'weather.forecast': 'পূর্বাভাস',
  'weather.drySpell': 'শুষ্ক সময় সনাক্ত হয়েছে',
  'recommendation.title': 'ফসল সুপারিশ',
  'recommendation.selectDistrict': 'জেলা নির্বাচন করুন',
  'recommendation.selectSoil': 'মাটির ধরন নির্বাচন করুন',
  'recommendation.confidence': 'আস্থার মাত্রা',
  'recommendation.reasoning': 'কারণ',
  'recommendation.fertilizationTip': 'সার পরামর্শ',
  'recommendation.irrigationAdvice': 'সেচ পরামর্শ',
  'disease.title': 'রোগ পরীক্ষা',
  'disease.uploadPhoto': 'ফসলের ছবি আপলোড করুন',
  'disease.diagnosis': 'রোগ নির্ণয়',
  'disease.treatment': 'চিকিৎসা',
  'history.title': 'ইতিহাস',
  'history.empty': 'এখনও কোনো পূর্ববর্তী সুপারিশ নেই',
  'expert.title': 'বিশেষজ্ঞ পরামর্শ',
  'expert.askQuestion': 'প্রশ্ন করুন',
  'profile.title': 'প্রোফাইল',
  'profile.language': 'ভাষা',
  'profile.district': 'জেলা',
  'voice.start': 'কথা বলা শুরু করুন',
  'voice.stop': 'থামুন',
  'voice.listening': 'শুনছে…',
  'voice.processing': 'প্রক্রিয়াকরণ হচ্ছে…',
  'forms.required': 'এই ক্ষেত্রটি আবশ্যক',
  'forms.email': 'ইমেল',
  'forms.password': 'পাসওয়ার্ড',
  'validation.required': 'আবশ্যক',
  'validation.invalidEmail': 'একটি বৈধ ইমেল লিখুন',
  'errors.generic': 'কিছু ভুল হয়েছে',
  'errors.network': 'নেটওয়ার্ক ত্রুটি। আপনার সংযোগ পরীক্ষা করুন।',
  'errors.notFound': 'খুঁজে পাওয়া যায়নি',
  'errors.unauthorized': 'চালিয়ে যেতে লগ ইন করুন',
  'loading.default': 'লোড হচ্ছে…',
  'loading.recommendation': 'আপনার সুপারিশ প্রস্তুত হচ্ছে…',
  'success.saved': 'সফলভাবে সংরক্ষিত হয়েছে',
  'success.updated': 'সফলভাবে আপডেট হয়েছে',
  'dialogs.confirmTitle': 'আপনি কি নিশ্চিত?',
  'dialogs.confirmDelete': 'এই ক্রিয়াটি পূর্বাবস্থায় ফেরানো যাবে না।',
  'tooltips.listen': 'এই লেখাটি শুনুন',
  'tooltips.changeLanguage': 'ভাষা পরিবর্তন করুন',
  'empty.noData': 'কোনো ডেটা উপলব্ধ নেই',
  'empty.noResults': 'কোনো ফলাফল পাওয়া যায়নি',
}

/**
 * The full dictionary registry, keyed by language code.
 * `en` first so it acts as the canonical fallback source.
 */
export const translations: Record<LanguageCode, Dictionary> = {
  en,
  hi,
  mr,
  gu,
  kn,
  ta,
  te,
  bn,
}

// ── Lookup ───────────────────────────────────────────────────────────────────

/** Values allowed for `{{placeholder}}` interpolation. */
export type TranslationVars = Record<string, string | number>

/** Remembers keys already warned about so dev logs aren't spammed. */
const warnedMissingKeys = new Set<string>()

/** Dev-only: log a missing/fallen-back key exactly once. */
function reportMissing(language: LanguageCode, key: string, fellBackToEnglish: boolean): void {
  if (process.env.NODE_ENV !== 'development') return
  const signature = `${language}:${key}`
  if (warnedMissingKeys.has(signature)) return
  warnedMissingKeys.add(signature)
  const suffix = fellBackToEnglish ? ' (used English fallback)' : ' (no translation found)'
  console.warn(`⚠ Missing translation: ${key} [${language}]${suffix}`)
}

/** Replace `{{name}}` placeholders with provided values. */
function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

/**
 * Resolve a key to its string in `language`, with graceful degradation:
 *   1. the requested language, else
 *   2. English, else
 *   3. the key itself — never `undefined`, never a throw.
 *
 * This is a pure, allocation-free O(1) lookup: safe to call in render.
 */
export function translate(
  language: LanguageCode,
  key: TranslationKey,
  vars?: TranslationVars,
): string {
  const direct = translations[language]?.[key]
  if (direct !== undefined) return interpolate(direct, vars)

  const fallback = translations.en[key]
  if (fallback !== undefined) {
    reportMissing(language, key, true)
    return interpolate(fallback, vars)
  }

  reportMissing(language, key, false)
  return interpolate(key, vars)
}
