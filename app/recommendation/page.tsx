'use client'

import { forwardRef, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { SOIL_TYPES, type SoilTypeId } from '@/lib/constants'
import { EntranceAnimation } from '@/components/EntranceAnimation'
import { EmptyState } from '@/components/EmptyState'
import { ListenButton } from '@/components/ListenButton'
import DemoPresetChips from '@/components/DemoPresetChips'
import type { CurrentWeather } from '@/lib/weather'
import { useLanguage } from '@/contexts/LanguageContext'
import { toSpeechLocale } from '@/lib/i18n/speech'
import type { LanguageCode, TranslationKey } from '@/lib/i18n/translations'
import { getCropTranslationKey } from '@/lib/i18n/translations'
import { getSeasonForMonth } from '@/lib/season'
import { computeIndex, estimateSoilMoisture, moistureLevelForPercent } from '@/lib/vegetationIndex'
import EnvironmentalConditionsCard from '@/components/EnvironmentalConditionsCard'
import { confidenceStyle } from '@/lib/confidence'

// ── Types ───────────────────────────────────────────────────────────────────

interface District {
  id: string
  name: string
  state: string
  latitude: number | null
  longitude: number | null
}

export interface RankedCrop {
  cropName: string
  suitabilityScore: number
  profitPotential: 'High' | 'Medium' | 'Low'
  riskLevel: 'Low' | 'Medium' | 'High'
  primaryReasons: string[]
  summary: string
  fertilization_tip: string
  irrigation_advice: string
}

/** Translated copies of the advisory fields; present only for non-English. */
interface TranslatedFields {
  reasoning: string
  fertilization_tip: string
  irrigation_advice: string
}

interface Recommendation {
  crop_name: string
  reasoning: string
  confidence_score: number
  fertilization_tip: string
  irrigation_advice: string
  is_dry_spell: boolean
  bestCrop: RankedCrop
  alternatives: RankedCrop[]
  /** Present when a non-English language was requested. */
  translated?: TranslatedFields
  /** Present when the AI service fell back to a safe default. */
  error?: string
}

const PAGE_TRANSLATIONS: Record<LanguageCode, Record<string, string>> = {
  en: {
    'rec.bestChoice': '🥇 Best Choice',
    'rec.suitabilityScore': 'Suitability Score',
    'rec.profitPotential': 'Profit Potential',
    'rec.riskLevel': 'Risk Level',
    'rec.whyBestChoice': 'Why this is our Best Choice',
    'rec.alternativeCrops': 'Alternative Crops',
    'rec.detailedReasoning': 'Detailed AI Reasoning',
    'rec.weatherAnalysis': 'Weather Analysis',
    'rec.environmentalFactors': 'Environmental Factors',
    'rec.recommendationLogic': 'Recommendation Logic',
    'rec.high': 'High',
    'rec.medium': 'Medium',
    'rec.low': 'Low',
    'rec.suitable': 'Suitable',
    'rec.profit': 'Profit',
    'rec.risk': 'Risk',
    'rec.aveTemp': 'Average Temperature (7-day)',
    'rec.expRain': 'Expected Rainfall (7-day)',
    'rec.drySpell': 'Dry Spell Expected',
    'rec.soilType': 'Soil Type',
    'rec.soilMoisture': 'Estimated Soil Moisture',
    'rec.vegStatus': 'Vegetation Status',
    'rec.reasons': 'Key Reasons',
    'soil.sandy.info': 'Sandy with low moisture retention. Suitable for drought-resistant crops like bajra and guar with efficient irrigation.',
    'soil.loamy.info': 'Highly fertile with good water retention. Suitable for crops such as wheat, rice, sugarcane, and many vegetables.',
    'soil.clayey.info': 'Heavy, moisture-retentive soil that holds water well. Ideal for water-loving crops like rice and sugarcane.',
    'soil.black_cotton.info': 'Rich in clay and excellent at retaining moisture. Ideal for crops like cotton and soybean, especially during the kharif season.',
    'soil.red.info': 'Well-drained and rich in iron. Best suited for millets, pulses, groundnut, and cotton with proper nutrient management.',
    'soil.laterite.info': 'Porous and acidic with moderate fertility. Performs well for tea, coffee, rubber, and cashew when properly managed.',
  },
  hi: {
    'rec.bestChoice': '🥇 सर्वोत्तम विकल्प',
    'rec.suitabilityScore': 'उपयुक्तता स्कोर',
    'rec.profitPotential': 'लाभ की संभावना',
    'rec.riskLevel': 'जोखिम स्तर',
    'rec.whyBestChoice': 'यह हमारा सर्वोत्तम विकल्प क्यों है',
    'rec.alternativeCrops': 'वैकल्पिक फसलें',
    'rec.detailedReasoning': 'विस्तृत एआई तर्क',
    'rec.weatherAnalysis': 'मौसम विश्लेषण',
    'rec.environmentalFactors': 'पर्यावरणीय कारक',
    'rec.recommendationLogic': 'सिफारिश तर्क',
    'rec.high': 'उच्च',
    'rec.medium': 'मध्यम',
    'rec.low': 'कम',
    'rec.suitable': 'उपयुक्त',
    'rec.profit': 'लाभ',
    'rec.risk': 'जोखिम',
    'rec.aveTemp': 'औसत तापमान (7-दिवसीय)',
    'rec.expRain': 'अपेक्षित वर्षा (7-दिवसीय)',
    'rec.drySpell': 'अपेक्षित सूखा काल',
    'rec.soilType': 'मिट्टी का प्रकार',
    'rec.soilMoisture': 'अनुमानित मिट्टी की नमी',
    'rec.vegStatus': 'वनस्पति की स्थिति',
    'rec.reasons': 'प्रमुख कारण',
    'soil.sandy.info': 'रेतीली मिट्टी जिसमें नमी रोकने की क्षमता कम होती है। कुशल सिंचाई के साथ बाजरा और ग्वार जैसी सूखा-प्रतिरोधी फसलों के लिए उपयुक्त है।',
    'soil.loamy.info': 'अच्छी जल धारण क्षमता के साथ अत्यधिक उपजाऊ। गेहूं, चावल, गन्ना और कई सब्जियों जैसी फसलों के लिए उपयुक्त है।',
    'soil.clayey.info': 'भारी, नमी बनाए रखने वाली मिट्टी जो पानी को अच्छी तरह से रोकती है। धान और गन्ना जैसी पानी-प्रिय फसलों के लिए आदर्श है।',
    'soil.black_cotton.info': 'मिट्टी से भरपूर और नमी बनाए रखने में उत्कृष्ट। कपास और सोयाबीन जैसी फसलों के लिए आदर्श, विशेष रूप से खरीफ के मौसम में।',
    'soil.red.info': 'अच्छी जल-निकासी वाली और आयरन से भरपूर। उचित पोषक तत्व प्रबंधन के साथ बाजरा, दलहन, मूंगफली और कपास के लिए सर्वोत्तम उपयुक्त है।',
    'soil.laterite.info': 'मध्यम उर्वरता वाली छिद्रपूर्ण और अम्लीय मिट्टी। उचित प्रबंधन के साथ चाय, कॉफी, रबर और काजू के लिए अच्छा प्रदर्शन करती है।',
  },
  mr: {
    'rec.bestChoice': '🥇 सर्वोत्तम पर्याय',
    'rec.suitabilityScore': 'उपयुक्तता स्कोअर',
    'rec.profitPotential': 'नफा क्षमता',
    'rec.riskLevel': 'धोक्याची पातळी',
    'rec.whyBestChoice': 'हा आमचा सर्वोत्तम पर्याय का आहे',
    'rec.alternativeCrops': 'पर्यायी पिके',
    'rec.detailedReasoning': 'सविस्तर एआय तर्क',
    'rec.weatherAnalysis': 'हवामान विश्लेषण',
    'rec.environmentalFactors': 'पर्यावरणीय घटक',
    'rec.recommendationLogic': 'शिफारस तर्क',
    'rec.high': 'उच्च',
    'rec.medium': 'मध्यम',
    'rec.low': 'कमी',
    'rec.suitable': 'योग्य',
    'rec.profit': 'नफा',
    'rec.risk': 'धोका',
    'rec.aveTemp': 'सरासरी तापमान (७ दिवस)',
    'rec.expRain': 'अपेक्षित पाऊस (७ दिवस)',
    'rec.drySpell': 'कोरडा काळ अपेक्षित',
    'rec.soilType': 'मातीचा प्रकार',
    'rec.soilMoisture': 'अंदाजे मातीतील ओलावा',
    'rec.vegStatus': 'वनस्पतीची स्थिती',
    'rec.reasons': 'प्रमुख कारणे',
    'soil.sandy.info': 'कमी ओलावा टिकवून ठेवणारी रेताड माती. कार्यक्षम सिंचनासह बाजरी आणि गवार यांसारख्या दुष्काळ-प्रतिरोधक पिकांसाठी योग्य.',
    'soil.loamy.info': 'चांगल्या जलधारण क्षमतेसह अत्यंत सुपीक. गहू, भात, ऊस आणि अनेक भाज्यांसारख्या पिकांसाठी योग्य.',
    'soil.clayey.info': 'जड, ओलावा टिकवून ठेवणारी माती जी पाणी चांगले धरून ठेवते. भात आणि ऊस यांसारख्या जास्त पाणी लागणाऱ्या पिकांसाठी आदर्श.',
    'soil.black_cotton.info': 'चिकणमातीचे प्रमाण जास्त असलेली आणि ओलावा टिकवून ठेवण्यात उत्कृष्ट. विशेषतः खरीप हंगामात कापूस आणि सोयाबीनसारख्या पिकांसाठी आदर्श.',
    'soil.red.info': 'चांगला निचरा होणारी आणि लोहाचे प्रमाण जास्त असणारी माती. योग्य पोषण व्यवस्थापनासह बाजरी, कडधान्ये, भुईमूग आणि कापसासाठी सर्वात योग्य.',
    'soil.laterite.info': 'मध्यम सुपीकता असणारी सच्छिद्र आणि अम्लीय माती. योग्य व्यवस्थापन केल्यास चहा, कॉफी, रबर आणि काजू पिकांसाठी चांगली कामगिरी करते.',
  },
  gu: {
    'rec.bestChoice': '🥇 શ્રેષ્ઠ પસંદગી',
    'rec.suitabilityScore': 'અનુકૂળતા સ્કોર',
    'rec.profitPotential': 'નફાની સંભાવના',
    'rec.riskLevel': 'જોખમનું સ્તર',
    'rec.whyBestChoice': 'આ શા માટે શ્રેષ્ઠ પસંદગી છે',
    'rec.alternativeCrops': 'વૈકલ્પિક પાક',
    'rec.detailedReasoning': 'વિગતવાર AI તર્ક',
    'rec.weatherAnalysis': 'હવામાન વિશ્લેષણ',
    'rec.environmentalFactors': 'પર્યાવરણીય પરિબળો',
    'rec.recommendationLogic': 'ભલામણ તર્ક',
    'rec.high': 'ઉચ્ચ',
    'rec.medium': 'મધ્યમ',
    'rec.low': 'ઓછું',
    'rec.suitable': 'અનુકૂળ',
    'rec.profit': 'નફો',
    'rec.risk': 'જોખમ',
    'rec.aveTemp': 'સરેરાશ તાપમાન (7 દિવસ)',
    'rec.expRain': 'અપેક્ષિત વરસાદ (7 દિવસ)',
    'rec.drySpell': 'સૂકો સમયગાળો અપેક્ષિત',
    'rec.soilType': 'જમીનનો પ્રકાર',
    'rec.soilMoisture': 'અંદાજિત જમીનનો ભેજ',
    'rec.vegStatus': 'વનસ્પતિની સ્થિતિ',
    'rec.reasons': 'મુખ્ય કારણો',
    'soil.sandy.info': 'ઓછી ભેજ સંગ્રह ક્ષમતા ધરાવતી રેતાળ જમીન. કાર્યક્ષમ સિંચાઈ સાથે બાજરી અને ગુવાર જેવા દુષ્કાળ-પ્રતિરોધક પાક માટે અનુકૂળ.',
    'soil.loamy.info': 'સારી જલધારણ ક્ષમતા સાથે અત્યંત ફળદ્રુપ. ઘઉં, ડાંગર, શેરડી અને ઘણી શાકભાજી જેવા પાકો માટે અનુકૂળ.',
    'soil.clayey.info': 'ભારે, ભેજ જાળવી રાખતી જમીન જે પાણીને સારી રીતે રોકે છે. ડાંગર અને શેરડી જેવા વધુ પાણીની જરૂરિયાતવાળા પાકો માટે આદર્શ.',
    'soil.black_cotton.info': 'ચીકણી માટીથી સમૃદ્ધ અને ભેજ જાળવી રાખવામાં ઉત્તમ. ખાસ કરીને ખરીફ ઋતુ દરમિયાન કપાસ અને சோયાબીન જેવા પાકો માટે આદર્શ.',
    'soil.red.info': 'સારી નિતાર શક્તિ ધરાવતી અને આયર્નથી ભરપૂર જમીન. યોગ્ય પોષક તત્વોના સંચાલન સાથે બાજરી, કઠોળ, મગફળી અને கપાસ માટે શ્રેષ્ઠ.',
    'soil.laterite.info': 'મધ્યમ ફળદ્રુપતા ધરાવતી છિદ્રાળુ અને એસિડિક જમીન. યોગ્ય વ્યવસ્થાપન સાથે ચા, કોફી, રબર અને કાજુ માટે ઉત્તમ પરિણામ આપે છે.',
  },
  kn: {
    'rec.bestChoice': '🥇 ಉತ್ತಮ ಆಯ್ಕೆ',
    'rec.suitabilityScore': 'ಸೂಕ್ತತೆಯ ಸ್ಕೋರ್',
    'rec.profitPotential': 'ಲಾಭದ ಸಾಮರ್ಥ್ಯ',
    'rec.riskLevel': 'ಅಪಾಯದ ಮಟ್ಟ',
    'rec.whyBestChoice': 'ಇದು ನಮ್ಮ ಉತ್ತಮ ಆಯ್ಕೆ ಏಕೆ',
    'rec.alternativeCrops': 'ಪರ್ಯಾಯ ಬೆಳೆಗಳು',
    'rec.detailedReasoning': 'ವಿವರವಾದ AI ತಾರ್ಕಿಕತೆ',
    'rec.weatherAnalysis': 'ಹವಾಮಾನ ವಿಶ್ಲೇಷಣೆ',
    'rec.environmentalFactors': 'ಪರಿಸರ ಅಂಶಗಳು',
    'rec.recommendationLogic': 'ಶಿಫಾರಸು ತರ್ಕ',
    'rec.high': 'ಹೆಚ್ಚು',
    'rec.medium': 'ಮಧ್ಯಮ',
    'rec.low': 'ಕಡಿಮೆ',
    'rec.suitable': 'ಸೂಕ್ತ',
    'rec.profit': 'ಲಾಭ',
    'rec.risk': 'ಅಪಾಯ',
    'rec.aveTemp': 'ಸರಾಸರಿ ತಾಪಮಾನ (7 ದಿನಗಳು)',
    'rec.expRain': 'ನಿರೀಕ್ಷಿತ ಮಳೆ (7 ದಿನಗಳು)',
    'rec.drySpell': 'ಬರಗಾಲದ ನಿರೀಕ್ಷೆ',
    'rec.soilType': 'ಮಣ್ಣಿನ ಪ್ರಕಾರ',
    'rec.soilMoisture': 'ಅಂದಾಜು ಮಣ್ಣಿನ ತೇವಾಂಶ',
    'rec.vegStatus': 'ಸಸ್ಯವರ್ಗದ ಸ್ಥಿತಿ',
    'rec.reasons': 'ಪ್ರಮುಖ ಕಾರಣಗಳು',
    'soil.sandy.info': 'ಕಡಿಮೆ ತೇವಾಂಶ ಹೊಂದಿರುವ ಮರಳು ಮಣ್ಣು. ಸಮರ್ಥ ನೀರಾವರಿಯೊಂದಿಗೆ ಸಜ್ಜೆ ಮತ್ತು ಗಜ್ಜರಿ ತರಹದ ಬರ-ನಿರೋಧಕ ಬೆಳೆಗಳಿಗೆ ಸೂಕ್ತವಾಗಿದೆ.',
    'soil.loamy.info': 'ಉತ್ತಮ ನೀರು ಹಿಡಿದಿಟ್ಟುಕೊಳ್ಳುವ ಸಾಮರ್ಥ್ಯವಿರುವ ಹೆಚ್ಚು ಫಲವತ್ತಾದ ಮಣ್ಣು. ಗೋಧಿ, ಭತ್ತ, ಕಬ್ಬು ಮತ್ತು ಅನೇಕ ತರಕಾರಿ ಬೆಳೆಗಳಿಗೆ ಸೂಕ್ತವಾಗಿದೆ.',
    'soil.clayey.info': 'ನೀರನ್ನು ಚೆನ್ನಾಗಿ ಹಿಡಿದಿಟ್ಟುಕೊಳ್ಳುವ ತೇವಾಂಶದ ಜೇಡಿಮಣ್ಣು. ಭತ್ತ ಮತ್ತು ಕಬ್ಬು ತರಹದ ಹೆಚ್ಚು ನೀರು ಬೇಡುವ ಬೆಳೆಗಳಿಗೆ ಸೂಕ್ತವಾಗಿದೆ.',
    'soil.black_cotton.info': 'ಜೇಡಿಮಣ್ಣಿನಿಂದ ಕೂಡಿದ ಮತ್ತು ತೇವಾಂಶವನ್ನು ಹಿಡಿದಿಟ್ಟುಕೊಳ್ಳುವಲ್ಲಿ ಅತ್ಯುತ್ತಮವಾದ ಮಣ್ಣು. ವಿಶೇಷವಾಗಿ ಮುಂಗಾರು ಹಂಗಾಮಿನಲ್ಲಿ ಹತ್ತಿ ಮತ್ತು ಸೋಯಾಬೀನ್ ಬೆಳೆಗಳಿಗೆ ಸೂಕ್ತವಾಗಿದೆ.',
    'soil.red.info': 'ಉತ್ತಮ ನೀರು ಬಸಿದುಹೋಗುವ ಮತ್ತು ಕಬ್ಬಿಣದ ಅಂಶ ಹೊಂದಿರುವ ಮಣ್ಣು. ಸರಿಯಾದ ಪೋಷಕಾಂಶಗಳ ನಿರ್ವಹಣೆಯೊಂದಿಗೆ ಸಿರಿಧಾನ್ಯಗಳು, ಬೇಳೆಕಾಳುಗಳು, ಕಡಲೆಕಾಯಿ ಮತ್ತು ಹತ್ತಿ ಬೆಳೆಗಳಿಗೆ ಸೂಕ್ತವಾಗಿದೆ.',
    'soil.laterite.info': 'ಮಧ್ಯಮ ಫಲವತ್ತತೆ ಹೊಂದಿರುವ ರಂಧ್ರಯುಕ್ತ ಮತ್ತು ಆಮ್ಲೀಯ ಮಣ್ಣು. ಸರಿಯಾದ ನಿರ್ವಹಣೆಯೊಂದಿಗೆ ಚಹಾ, ಕಾಫಿ, ರಬ್ಬರ್ ಮತ್ತು ಗೋಡಂಬಿ ಬೆಳೆಗಳಿಗೆ ಸೂಕ್ತವಾಗಿದೆ.',
  },
  ta: {
    'rec.bestChoice': '🥇 சிறந்த தேர்வு',
    'rec.suitabilityScore': 'பொருத்தமான மதிப்பெண்',
    'rec.profitPotential': 'லாப திறன்',
    'rec.riskLevel': 'ஆபத்து நிலை',
    'rec.whyBestChoice': 'இது ஏன் எங்கள் சிறந்த தேர்வு',
    'rec.alternativeCrops': 'மாற்று பயிர்கள்',
    'rec.detailedReasoning': 'விரிவான AI பகுப்பாய்வு',
    'rec.weatherAnalysis': 'வானிலை பகுப்பாய்வு',
    'rec.environmentalFactors': 'சுற்றுச்சூழல் காரணிகள்',
    'rec.recommendationLogic': 'பரிந்துரை தர்க்கம்',
    'rec.high': 'அதிகம்',
    'rec.medium': 'நடுத்தரம்',
    'rec.low': 'குறைவு',
    'rec.suitable': 'பொருத்தமானது',
    'rec.profit': 'லாபம்',
    'rec.risk': 'ஆபத்து',
    'rec.aveTemp': 'சராசரி வெப்பநிலை (7-நாட்கள்)',
    'rec.expRain': 'எதிர்பார்க்கப்படும் மழை (7-நாட்கள்)',
    'rec.drySpell': 'வறண்ட காலம் எதிர்பார்க்கப்படுகிறது',
    'rec.soilType': 'மண் வகை',
    'rec.soilMoisture': 'மதிப்பிடப்பட்ட மண் ஈரப்பதம்',
    'rec.vegStatus': 'பயிர் நிலைமை',
    'rec.reasons': 'முக்கிய காரணங்கள்',
    'soil.sandy.info': 'குறைந்த ஈரப்பதம் கொண்ட மணல் மண். திறமையான பாசனத்துடன் கம்பு மற்றும் கொத்தவரை போன்ற வறட்சியைத் தாங்கும் பயிர்களுக்கு ஏற்றது.',
    'soil.loamy.info': 'நல்ல நீர் தக்கவைப்புடன் கூடிய அதிக வளமான மண். கோதுமை, நெல், கரும்பு மற்றும் பல காய்கறி பயிர்களுக்கு ஏற்றது.',
    'soil.clayey.info': 'நீரை நன்கு தக்கவைக்கும் கனமான ஈரப்பதம் கொண்ட மண். நெல் மற்றும் கரும்பு போன்ற அதிக நீர் தேவைப்படும் பயிர்களுக்கு ஏற்றது.',
    'soil.black_cotton.info': 'களிமண் நிறைந்து ஈரப்பதத்தை தக்கவைப்பதில் சிறந்தது. பருத்தி மற்றும் சோயாபீன் போன்ற பயிர்களுக்கு ஏற்றது, குறிப்பாக खरीफ பருவத்தில்.',
    'soil.red.info': 'நல்ல வடிகால் வசதியும் இரும்புச்சத்தும் கொண்ட மண். சரியான ஊட்டச்சத்து மேலாண்மையுடன் தினை வகைகள், பருப்பு வகைகள், நிலக்கடலை மற்றும் பருத்திக்கு மிகவும் ஏற்றது.',
    'soil.laterite.info': 'மிதமான வளமுள்ள அமிலத்தன்மை கொண்ட மண். முறையான மேலாண்மையுடன் தேயிலை, காபி, ரப்பர் மற்றும் முந்திரி பயிர்களுக்கு ஏற்றது.',
  },
  te: {
    'rec.bestChoice': '🥇 అత్యుత్తమ ఎంపిక',
    'rec.suitabilityScore': 'అనుకూలత స్కోరు',
    'rec.profitPotential': 'లాభదాయకత',
    'rec.riskLevel': 'ప్రమాద స్థాయి',
    'rec.whyBestChoice': 'ఇది ఎందుకు అత్యుత్తమ ఎంపిక',
    'rec.alternativeCrops': 'ప్రత్యామ్నాయ పంటలు',
    'rec.detailedReasoning': 'వివరణాత్మక AI విశ్లేషణ',
    'rec.weatherAnalysis': 'వాతావరణ విశ్లేషణ',
    'rec.environmentalFactors': 'పర్యావరణ అంశాలు',
    'rec.recommendationLogic': 'సిఫార్సు తర్కం',
    'rec.high': 'అధికం',
    'rec.medium': 'మధ్యస్థం',
    'rec.low': 'తక్కువ',
    'rec.suitable': 'అనుకూలం',
    'rec.profit': 'లాభం',
    'rec.risk': 'ప్రమాదం',
    'rec.aveTemp': 'సగటు ఉష్ణోగ్రత (7 రోజులు)',
    'rec.expRain': 'ఆశించే వర్షపాతం (7 రోజులు)',
    'rec.drySpell': 'పొడి వాతావరణ ముప్పు',
    'rec.soilType': 'నేల రకం',
    'rec.soilMoisture': 'అంచనా వేసిన నేల తేమ',
    'rec.vegStatus': 'పంట స్థితి',
    'rec.reasons': 'ముఖ్య కారణాలు',
    'soil.sandy.info': 'తక్కువ తేమను నిలుపుకునే ఇసుక నేల. సమర్థవంతమైన నీటి పారుదలతో సజ్జలు మరియు గోరుచిక్కుడు వంటి కరువును తట్టుకునే పంటలకు అనుకూలం.',
    'soil.loamy.info': 'మంచి నీటి నిలుపుదల సామర్థ్యం ఉన్న అత్యంత సారవంతమైన నేల. గోధుమలు, వరి, చెరకు మరియు అనేక కూరగాయల పంటలకు అనుకూలం.',
    'soil.clayey.info': 'నమిని బాగా నిలుపుకునే బరువైన నేల. వరి మరియు చెరకు వంటి ఎక్కువ నీరు అవసరమయ్యే పంటలకు అత్యంత అనుకూలం.',
    'soil.black_cotton.info': 'జిగురు నేల మరియు తేమను నిలుపుకోవడంలో అద్భుతమైనది. ముఖ్యంగా ఖరీఫ్ సీజన్లో పత్తి మరియు సోయాబీన్ వంటి పంటలకు అత్యంత అనుకూలం.',
    'soil.red.info': 'త్వరగా నీరు ఇంకిపోయే మరియు ఇనుప ఖనిజం అధికంగా ఉన్న నేల. సరైన పోషకాల యాజమాన్యంతో తృణధాన్యాలు, పప్పుదినుసులు, వేరుశనగ మరియు పత్తి పంటలకు అనుకూలం.',
    'soil.laterite.info': 'మధ్యస్థ సారవంతమైన ఆమ్ల గుణం కలిగిన నేల. సరైన యాజమాన్య పద్ధతులతో టీ, కాఫీ, రబ్బరు మరియు జీడిమామిడి పంటలకు అనుకూలం.',
  },
  bn: {
    'rec.bestChoice': '🥇 সেরা পছন্দ',
    'rec.suitabilityScore': 'উপযুক্ততা স্কোর',
    'rec.profitPotential': 'মুনাফার সম্ভাবনা',
    'rec.riskLevel': 'ঝুঁকির মাত্রা',
    'rec.whyBestChoice': 'কেন এটি আমাদের সেরা পছন্দ',
    'rec.alternativeCrops': 'বিকল্প ফসল',
    'rec.detailedReasoning': 'বিস্তারিত AI যুক্তি',
    'rec.weatherAnalysis': 'আবহাওয়া বিশ্লেষণ',
    'rec.environmentalFactors': 'পরিবেশগত কারণসমূহ',
    'rec.recommendationLogic': 'সুপারিশ যুক্তি',
    'rec.high': 'উচ্চ',
    'rec.medium': 'মাঝারি',
    'rec.low': 'কম',
    'rec.suitable': 'উপযুক্ত',
    'rec.profit': 'মুনাফা',
    'rec.risk': 'ঝুঁকি',
    'rec.aveTemp': 'গড় তাপমাত্রা (৭ দিন)',
    'rec.expRain': 'ప్రত্যাশিত বৃষ্টিপাত (৭ দিন)',
    'rec.drySpell': 'শুষ্ক স্পেলের পূর্বাভাস',
    'rec.soilType': 'মাটির ধরন',
    'rec.soilMoisture': 'অনুমিত মাটির আর্দ্রতা',
    'rec.vegStatus': 'উদ্ভিদের অবস্থা',
    'rec.reasons': 'মূল কারণসমূহ',
    'soil.sandy.info': 'কম আর্দ্রতা ধারণ ক্ষমতা সম্পন্ন বেলে মাটি। দক্ষ সেচের সাথে বাজরা এবং গুয়ারের মতো খরা-সহনশীল ফসলের জন্য উপযুক্ত।',
    'soil.loamy.info': 'ভালো জল ধারণ ক্ষমতা সহ অত্যন্ত উর্বর মাটি। গম, ধান, আখ এবং অনেক শাকসবজির মতো ফসলের জন্য উপযুক্ত।',
    'soil.clayey.info': 'ভারী, আর্দ্রতা ধারণ ক্ষমতা সম্পন্ন মাটি যা জল ভালো ধরে রাখে। ধান ও আখের মতো জল-প্রিয় ফসলের জন্য আদর্শ।',
    'soil.black_cotton.info': 'কাদামাটি সমৃদ্ধ এবং আর্দ্রতা ধরে রাখতে চমৎকার। বিশেষ করে খরিফ মৌসুমে তুলা ও সয়াবিনের মতো ফসলের জন্য আদর্শ।',
    'soil.red.info': 'ভালো জল নিষ্কাশন যুক্ত এবং আয়রন সমৃদ্ধ মাটি। সঠিক পুষ্টি ব্যবস্থাপনার সাথে বাজরা, ডাল, চিনাবাদাম এবং তুলার জন্য সবচেয়ে উপযোগী।',
    'soil.laterite.info': 'মাঝারি উর্বরতা সম্পন্ন অম্লীয় মাটি। সঠিক ব্যবস্থাপনার সাথে চা, কফি, রাবার এবং কাজু চাষের জন্য ভালো।',
  },
}

type InitState = 'loading' | 'ready' | 'unauthenticated' | 'error'

// ── Languages ─────────────────────────────────────────────────────────────────
// The active language now comes from the global LanguageContext (see the
// bottom-right selector). `LanguageCode` and the language list live in
// `lib/i18n/translations.ts`; this page only reads the current value.

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const SOIL_DETAILS: Record<SoilTypeId, { description: string; icon: ReactNode }> = {
  sandy: {
    description: 'Light, fast-draining soil that warms early in the season.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M3 16c2-2 3-2 4.5 0S11 18 12 16s2.5-2 4.5 0 2 2 4.5 0" />
        <path d="M3 11c2-2 3-2 4.5 0S11 13 12 11s2.5-2 4.5 0 2 2 4.5 0" />
      </svg>
    ),
  },
  loamy: {
    description: 'Balanced, fertile soil — ideal for most field crops.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M12 20v-7" />
        <path d="M12 13c0-3 2-5 5-5 0 3-2 5-5 5Z" />
        <path d="M12 15c0-2.5-1.8-4.5-4.5-4.5 0 2.7 2 4.5 4.5 4.5Z" />
      </svg>
    ),
  },
  clayey: {
    description: 'Heavy, moisture-retentive soil that holds water well.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M4 8.5 12 5l8 3.5-8 3.5-8-3.5Z" />
        <path d="m4 12 8 3.5L20 12" />
        <path d="m4 15.5 8 3.5 8-3.5" />
      </svg>
    ),
  },
  black_cotton: {
    description: 'Rich black soil with high clay content and good fertility.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M12 3v18" />
        <path d="M12 8c1.5-1.4 3-1.4 4.5 0M12 8c-1.5-1.4-3-1.4-4.5 0" />
        <path d="M12 13c1.5-1.4 3-1.4 4.5 0M12 13c-1.5-1.4-3-1.4-4.5 0" />
      </svg>
    ),
  },
  red: {
    description: 'Iron-rich porous soil suitable for pulses and oilseeds.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />
        <path d="M12 6v12" />
        <path d="M6 12h12" />
      </svg>
    ),
  },
  laterite: {
    description: 'Acidic, leached soil rich in aluminium and iron oxides.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      </svg>
    ),
  },
}

const CheckIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m20 6-11 11-5-5" />
  </svg>
)

// ── Soil presentation (copy + icons live here; ids/labels come from constants)─



const ChevronIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
)

const WarningIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
)

const RefreshIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

const ArrowLeftIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
)

const LeafIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 20A7 7 0 0 1 14 6c3 0 6 3 6 6a7 7 0 0 1-5 6.7" />
    <path d="M11 20a7 7 0 0 1-7-7c0-3 3-6 6-6 1.4 0 2.7.5 3.7 1.3" />
    <path d="M11 20v-8" />
  </svg>
)

const MapPinIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)

const SparklesIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
  </svg>
)

// ── Page ────────────────────────────────────────────────────────────────────

export default function RecommendationPage() {
  const supabase = useMemo(() => createClient(), [])
  const resultRef = useRef<HTMLElement>(null)

  const [initState, setInitState] = useState<InitState>('loading')
  const [districts, setDistricts] = useState<District[]>([])
  const [selectedState, setSelectedState] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [soil, setSoil] = useState<SoilTypeId>('loamy')

  const states = useMemo(() => {
    const list = districts.map((d) => d.state).filter(Boolean)
    return [...new Set(list)].sort()
  }, [districts])

  const filteredDistricts = useMemo(() => {
    if (!selectedState) return []
    return districts.filter((d) => d.state === selectedState)
  }, [districts, selectedState])

  const selectedDistrict = useMemo(() => {
    return districts.find((d) => d.id === districtId) || null
  }, [districts, districtId])

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Recommendation | null>(null)
  const [weather, setWeather] = useState<CurrentWeather | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [soilMoisture, setSoilMoisture] = useState(50)

  const LOADING_STEPS = [
    'recommendation.loading.weather',
    'recommendation.loading.moisture',
    'recommendation.loading.analyzing',
    'recommendation.loading.selecting',
    'recommendation.loading.preparing',
  ] as const

  const [loadingStepIndex, setLoadingStepIndex] = useState(0)

  useEffect(() => {
    if (!submitting) return

    const interval = setInterval(() => {
      setLoadingStepIndex((prev) => (prev + 1) % 5)
    }, 1500)

    return () => clearInterval(interval)
  }, [submitting])

  // Fetch weather at page level when selected district coordinates change
  useEffect(() => {
    if (!selectedDistrict || selectedDistrict.latitude === null || selectedDistrict.longitude === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset weather when no district is selected
      setWeather(null)
      setWeatherLoading(false)
      setSoilMoisture(50)
      return
    }

    let active = true
    setWeatherLoading(true)

    fetch(`/api/weather?lat=${selectedDistrict.latitude}&lon=${selectedDistrict.longitude}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('weather request failed')
        return res.json() as Promise<{ weather: CurrentWeather | null }>
      })
      .then((data) => {
        if (!active) return
        setWeather(data.weather)
        setWeatherLoading(false)
        if (data.weather) {
          const rain7d = Math.round(
            data.weather.forecast.reduce((sum, day) => sum + day.precipitation, 0) * 10
          ) / 10
          const est = estimateSoilMoisture(rain7d, data.weather.humidity, data.weather.temperature)
          setSoilMoisture(est.percent)
        } else {
          setSoilMoisture(50)
        }
      })
      .catch(() => {
        if (!active) return
        setWeather(null)
        setWeatherLoading(false)
        setSoilMoisture(50)
      })

    return () => {
      active = false
    }
  }, [selectedDistrict])

  const rainfallMm7d = useMemo(() => {
    if (!weather) return 0
    return Math.round(
      weather.forecast.reduce((sum, day) => sum + day.precipitation, 0) * 10,
    ) / 10
  }, [weather])

  const moistureLevel = useMemo(() => {
    return moistureLevelForPercent(soilMoisture)
  }, [soilMoisture])

  const season = useMemo(() => {
    const month = new Date().getMonth() + 1
    return getSeasonForMonth(month)
  }, [])

  const computedVegIndex = useMemo(() => {
    return computeIndex(soilMoisture, rainfallMm7d, season)
  }, [soilMoisture, rainfallMm7d, season])

  const [formError, setFormError] = useState<string | null>(null)

  // Language is global now: the single selector in the layout drives it, and the
  // provider handles persistence + restore. This page just reads the value.
  const { language, t } = useLanguage()
  const pt = (key: string) => {
    return PAGE_TRANSLATIONS[language]?.[key] ?? PAGE_TRANSLATIONS['en']?.[key] ?? key
  }

  // Load the session + district options once on mount.
  useEffect(() => {
    let active = true

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return
      if (!user) {
        setInitState('unauthenticated')
        return
      }

      const [{ data: districtRows, error: districtError }, { data: profile }] = await Promise.all([
        supabase.from('districts').select('id, name, state, latitude, longitude').order('name'),
        supabase.from('users').select('district_id, soil_type').eq('id', user.id).single(),
      ])

      if (!active) return
      if (districtError || !districtRows || districtRows.length === 0) {
        setInitState('error')
        return
      }

      setDistricts(districtRows)
      const preferred = profile?.district_id
      const defaultDistrict = preferred && districtRows.find((d) => d.id === preferred)
        ? districtRows.find((d) => d.id === preferred)
        : districtRows[0]

      if (defaultDistrict) {
        setSelectedState(defaultDistrict.state)
        setDistrictId(defaultDistrict.id)
      }

      const preferredSoil = profile?.soil_type as SoilTypeId | undefined
      if (preferredSoil && ['sandy', 'loamy', 'clayey', 'black_cotton', 'red', 'laterite'].includes(preferredSoil)) {
        setSoil(preferredSoil)
      } else {
        setSoil('loamy')
      }

      setInitState('ready')
    }

    init()
    return () => {
      active = false
    }
  }, [supabase])

  // Scroll result into view after it appears.
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [result])

  // Shared request used by both the generate button and language switching.
  // `lang` is passed explicitly (not read from state) so an immediate re-fetch
  // after a language change uses the new value without waiting for a re-render.
  async function requestRecommendation(
    targetSoil: SoilTypeId,
    lang: LanguageCode,
    overrideDistrictId?: string,
  ) {
    // `overrideDistrictId` lets callers (e.g. demo presets) pass a freshly
    // selected district without waiting for the `districtId` state to settle,
    // so the request never races the setState that selected it.
    const targetDistrictId = overrideDistrictId ?? districtId
    if (!targetDistrictId || submitting) return

    setSubmitting(true)
    setLoadingStepIndex(0)
    setFormError(null)
    setResult(null)

    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district_id: targetDistrictId,
          soil_type: targetSoil,
          target_lang: lang,
          soil_moisture_pct: soilMoisture,
        }),
      })
      const data: Recommendation & { error?: string } = await res.json()

      if (!res.ok) {
        setFormError(data?.error ?? t('errors.generic'))
        return
      }
      setResult(data)
    } catch {
      setFormError(t('errors.network'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleGenerate() {
    if (!soil) return
    requestRecommendation(soil, language)
  }

  // Invoked by the demo preset chips: kicks off the existing workflow with the
  // preset's explicit soil + district so it can't read stale state.
  function handlePresetGenerate(presetSoil: SoilTypeId, presetDistrictId: string) {
    requestRecommendation(presetSoil, language, presetDistrictId)
  }

  // When the global language changes and a result is already on screen,
  // re-request it in the new language. The initial mount (and the provider's
  // post-hydration restore, which fires before any result exists) is skipped.
  const prevLanguageRef = useRef(language)
  useEffect(() => {
    if (prevLanguageRef.current === language) return
    prevLanguageRef.current = language
    if (result && soil && !submitting) {
      // Re-request the recommendation in the newly selected language. This is a
      // deliberate reaction to external (context) state, not derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional re-fetch on language change
      requestRecommendation(soil, language)
    }
    // Re-run only when `language` changes; requestRecommendation is a stable
    // closure over current component state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  function handleReset() {
    setResult(null)
    setFormError(null)
  }

  const canGenerate = initState === 'ready' && !!soil && !!districtId && !submitting

  return (
    <main className="min-h-screen bg-slate-50 font-sans" aria-busy={submitting}>
      {/* Nav breadcrumb */}
      <div className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex h-12 w-full max-w-2xl items-center gap-2 px-5 sm:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 rounded"
          >
            {ArrowLeftIcon}
            <span>{t('recommendation.back')}</span>
          </Link>
          <span className="text-slate-200" aria-hidden="true">/</span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span className="text-primary-green">{LeafIcon}</span>
            {t('recommendation.cropAdvisory')}
          </span>
          {/* Language is chosen from the single global selector (bottom-right). */}
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-6 sm:py-14">
        {/* Header */}
        <header className="mb-9">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 sm:text-2xl">
            {t('recommendation.findCropTitle')}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {t('recommendation.findCropDetail')}
          </p>
        </header>

        {initState === 'loading' && <InitSkeleton />}

        {initState === 'unauthenticated' && (
          <NoticeCard
            title={t('recommendation.pleaseSignIn')}
            body={t('recommendation.signInDetail')}
            action={
              <Link
                href="/login"
                className="inline-flex h-9 items-center rounded-lg bg-primary-green px-4 text-sm font-medium text-white transition-colors hover:bg-primary-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40"
              >
                {t('recommendation.goToSignIn')}
              </Link>
            }
          />
        )}

        {initState === 'error' && (
          <NoticeCard
            title={t('recommendation.loadDistrictsFailed')}
            body={t('recommendation.loadDistrictsFailedDetail')}
          />
        )}

        {initState === 'ready' && (
          <>
            {/* Demo preset chips — one-click scenarios for judges. Populate the
                form state below and trigger the existing workflow. */}
            <DemoPresetChips
              districts={districts}
              setState={setSelectedState}
              setDistrict={setDistrictId}
              setSoilType={setSoil}
              setMoisture={setSoilMoisture}
              onGenerate={handlePresetGenerate}
              submitting={submitting}
            />

            {/* ── SECTION 3: Recommendation form ──────────────────────────────
                A single, scannable card: location → CTA. */}
            <section
              aria-label={t('recommendation.cropAdvisory')}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* State */}
                <div>
                  <label htmlFor="state" className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t('recommendation.form.state')}
                  </label>
                  <div className="relative">
                    <select
                      id="state"
                      value={selectedState}
                      onChange={(e) => {
                        const nextState = e.target.value
                        setSelectedState(nextState)
                        // Auto-select the first district in the new state
                        const firstInState = districts.find((d) => d.state === nextState)
                        if (firstInState) {
                          setDistrictId(firstInState.id)
                        }
                      }}
                      className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-3.5 pr-10 text-sm text-slate-900 shadow-sm transition-colors hover:border-slate-300 focus:border-primary-green focus:outline-none focus:ring-4 focus:ring-primary-green/10"
                    >
                      {states.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {ChevronIcon}
                    </span>
                  </div>
                </div>

                {/* District */}
                <div>
                  <label htmlFor="district" className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t('recommendation.form.district')}
                  </label>
                  <div className="relative">
                    <select
                      id="district"
                      value={districtId}
                      onChange={(e) => setDistrictId(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-3.5 pr-10 text-sm text-slate-900 shadow-sm transition-colors hover:border-slate-300 focus:border-primary-green focus:outline-none focus:ring-4 focus:ring-primary-green/10"
                    >
                      {filteredDistricts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {ChevronIcon}
                    </span>
                  </div>
                </div>
              </div>

              {/* Soil selection — compact chips (icon + label). Descriptions were
                  removed to keep the form scannable; the radio semantics stay. */}
              <fieldset className="mt-5">
                <legend className="mb-2.5 text-sm font-medium text-slate-700">
                  {t('recommendation.form.soilType')}
                </legend>
                <div
                  role="radiogroup"
                  aria-label={t('recommendation.form.soilType')}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                >
                  {SOIL_TYPES.map((option) => {
                    const selected = soil === option.id
                    const detail = SOIL_DETAILS[option.id]
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        title={t(`soil.${option.id}.desc` as TranslationKey)}
                        onClick={() => setSoil(option.id)}
                        className={[
                          'group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-200',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 focus-visible:ring-offset-1',
                          selected
                            ? 'border-primary-green bg-primary-green/5 ring-1 ring-primary-green/10'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                            selected
                              ? 'bg-primary-green/10 text-primary-green'
                              : 'bg-slate-100 text-slate-500 group-hover:text-slate-600',
                          ].join(' ')}
                        >
                          <span className="h-[18px] w-[18px]">{detail.icon}</span>
                        </span>
                        <span className="min-w-0 flex-1 text-[13px] font-medium leading-tight text-slate-800">
                          {t(`soil.${option.id}.label` as TranslationKey)}
                        </span>
                        {selected && (
                          <span
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-green text-white"
                            aria-hidden="true"
                          >
                            {CheckIcon}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {/* Compact, farmer-friendly, animated Soil Info Card */}
              {soil && (
                <>
                  <style>{`
                    @keyframes fadeInSlide {
                      from {
                        opacity: 0;
                        transform: translateY(4px);
                      }
                      to {
                        opacity: 1;
                        transform: translateY(0);
                      }
                    }
                    .animate-soil-card {
                      animation: fadeInSlide 0.25s ease-out forwards;
                    }
                  `}</style>
                  <div
                    key={soil}
                    className="mt-4 animate-soil-card rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3.5 transition-all duration-200 shadow-sm"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-sm" aria-hidden="true">
                        🌱
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-[0.05em]">
                          {t(`soil.${soil}.label` as TranslationKey)}
                        </h4>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-600 font-medium">
                          {pt(`soil.${soil}.info`)}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Generate — the single primary CTA on the page. */}
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-green text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-primary-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                >
                  {submitting ? (
                    <>
                      <LoadingDots />
                      <span>{t(LOADING_STEPS[loadingStepIndex] as TranslationKey)}</span>
                    </>
                  ) : (
                    t('recommendation.form.generateBtn')
                  )}
                </button>
              </div>
            </section>

            {/* Error with Retry */}
            {formError && (
              <div
                role="alert"
                aria-live="assertive"
                className="mt-5 rounded-xl border border-rose-100 bg-rose-50/60 p-3.5 text-sm text-rose-700"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 text-rose-500">{WarningIcon}</span>
                  <div className="flex-1">
                    <p className="leading-relaxed">{formError}</p>
                    <button
                      type="button"
                      onClick={handleGenerate}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-800 underline transition-colors hover:text-rose-950 focus:outline-none"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── SECTION 4: Hero recommendation (revealed after Generate) ───── */}
            {submitting && <ResultSkeleton />}

            {!submitting && result && (
              <>
                {result.bestCrop ? (
                  <>
                    <HeroRecommendationCard
                      ref={resultRef}
                      result={result}
                      language={language}
                      onReset={handleReset}
                      soil={soil}
                    />

                    <AlternativesCard
                      result={result}
                      language={language}
                    />
                  </>
                ) : (
                  <LegacyResultCard
                    ref={resultRef}
                    result={result}
                    language={language}
                    onReset={handleReset}
                  />
                )}
              </>
            )}

            {/* Empty States */}
            {!submitting && !result && (
              <div className="mt-5">
                {!districtId ? (
                  <EmptyState
                    icon={MapPinIcon}
                    title={t('recommendation.empty.district.title')}
                    description={t('recommendation.empty.district.body')}
                  />
                ) : (
                  <EmptyState
                    icon={SparklesIcon}
                    title={t('recommendation.empty.result.title')}
                    description={t('recommendation.empty.result.body')}
                  />
                )}
              </div>
            )}

            {/* ── SECTION 5: Supporting environmental data ──── */}
            {selectedDistrict && (
              <section aria-label={t('recommendation.section.environmental')} className="mt-10">
                <EnvironmentalConditionsCard
                  weather={weather}
                  weatherLoading={weatherLoading}
                  vegetationStatus={computedVegIndex.status}
                  moistureLevel={moistureLevel}
                  moisturePercent={soilMoisture}
                />
              </section>
            )}

            {/* Advanced Insights (Detailed AI Analysis) */}
            {!submitting && result && result.bestCrop && (
              <AdvancedInsightsAccordions
                result={result}
                language={language}
                weather={weather}
                soil={soil}
                soilMoisture={soilMoisture}
                moistureLevel={moistureLevel}
                computedVegIndex={computedVegIndex}
              />
            )}
          </>
        )}
      </div>
    </main>
  )
}

// ── Result card ─────────────────────────────────────────────────────────────

// ── Hero Recommendation Card ────────────────────────────────────────────────
const HeroRecommendationCard = forwardRef<
  HTMLElement,
  { result: Recommendation; language: LanguageCode; onReset: () => void; soil: string }
>(
  function HeroRecommendationCard({ result, language, onReset, soil }, ref) {
    const { t } = useLanguage()
    const pt = (key: string) => {
      return PAGE_TRANSLATIONS[language]?.[key] ?? PAGE_TRANSLATIONS['en']?.[key] ?? key
    }

    const suitability = result.bestCrop.suitabilityScore
    const suitColor =
      suitability >= 90
        ? { bg: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' }
        : suitability >= 80
          ? { bg: 'bg-amber-50 text-amber-700 ring-amber-600/20' }
          : { bg: 'bg-rose-50 text-rose-700 ring-rose-600/20' }

    const risk = result.bestCrop.riskLevel
    const riskColor =
      risk === 'Low'
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/10'
        : risk === 'Medium'
          ? 'bg-amber-50 text-amber-700 ring-amber-600/10'
          : 'bg-rose-50 text-rose-700 ring-rose-600/10'

    const profit = result.bestCrop.profitPotential
    const profitColor =
      profit === 'High'
        ? 'bg-indigo-50 text-indigo-700 ring-indigo-600/10'
        : profit === 'Medium'
          ? 'bg-blue-50 text-blue-700 ring-blue-600/10'
          : 'bg-slate-50 text-slate-700 ring-slate-600/10'

    return (
      <EntranceAnimation>
        <section
          ref={ref}
          aria-live="polite"
          aria-label="Best Choice crop recommendation"
          className="mt-8 overflow-hidden rounded-2xl border-2 border-emerald-500 bg-white shadow-md ring-1 ring-emerald-500/5"
        >
          {/* Banner header */}
          <div className="bg-emerald-500 px-5 py-2.5 sm:px-6 text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <span>{pt('rec.bestChoice')}</span>
          </div>

          <div className="p-5 sm:p-6">
            {/* Crop name & suitability score badge */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                  {t(getCropTranslationKey(result.bestCrop.cropName))}
                </h2>
              </div>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${suitColor.bg}`}
              >
                {suitability}% {pt('rec.suitable')}
              </span>
            </div>

            {/* Badges row for Profit and Risk */}
            <div className="mt-3.5 flex flex-wrap gap-2">
              <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${profitColor}`}>
                💸 {pt('rec.profitPotential')}: {pt(`rec.${profit.toLowerCase()}`)}
              </span>
              <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${riskColor}`}>
                ⚠️ {pt('rec.riskLevel')}: {pt(`rec.${risk.toLowerCase()}`)}
              </span>
            </div>

            {/* Bulleted checklist of key reasons */}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {pt('rec.reasons')}
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {result.bestCrop.primaryReasons.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-500 font-bold text-base leading-none">✔</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Concise AI summary */}
            <div className="mt-4 border-l-2 border-slate-200 pl-3">
              <p className="text-sm italic leading-relaxed text-slate-500">
                {result.bestCrop.summary}
              </p>
            </div>

            {/* "Why this is #1" section */}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {pt('rec.whyBestChoice')}
              </h3>
              <ul className="mt-2.5 space-y-1.5 text-xs text-slate-500 list-disc list-inside">
                <li>Best match for your {t(`soil.${soil}` as TranslationKey)} soil type</li>
                <li>Highest environmental suitability ({suitability}%) under current weather</li>
                <li>Lowest overall cultivation risk ({pt(`rec.${risk.toLowerCase()}`)} risk)</li>
              </ul>
            </div>
          </div>

          {/* Reset button */}
          <div className="border-t border-slate-100 px-5 py-3.5 sm:px-6 bg-slate-50/50">
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 rounded"
            >
              {RefreshIcon}
              {t('recommendation.result.tryDifferentSoil')}
            </button>
          </div>
        </section>
      </EntranceAnimation>
    )
  },
)

// ── Legacy Result Card (Fallback UI) ────────────────────────────────────────
const LegacyResultCard = forwardRef<
  HTMLElement,
  { result: Recommendation; language: LanguageCode; onReset: () => void }
>(
  function LegacyResultCard({ result, language, onReset }, ref) {
    const { t } = useLanguage()

    let displayReasoning = result.reasoning
    let displayFert = result.fertilization_tip
    let displayIrr = result.irrigation_advice
    let bestCropName = result.crop_name
    let percent = Math.round(result.confidence_score * 100)

    try {
      const parsed = JSON.parse(result.reasoning)
      if (parsed && parsed.bestCrop) {
        bestCropName = parsed.bestCrop.cropName || bestCropName
        percent = parsed.bestCrop.suitabilityScore || percent
        displayReasoning = parsed.bestCrop.summary || displayReasoning
        displayFert = parsed.bestCrop.fertilization_tip || displayFert
        displayIrr = parsed.bestCrop.irrigation_advice || displayIrr
      }
    } catch {
      // Keep as is
    }

    const confidence = confidenceStyle(result.confidence_score)

    return (
      <EntranceAnimation>
        <section
          ref={ref}
          aria-live="polite"
          aria-label="Recommendation result"
          className="mt-8 overflow-hidden rounded-2xl border border-primary-green/20 bg-white shadow-md ring-1 ring-primary-green/5"
        >
          <div className="p-5 sm:p-6">
            {/* Crop name + badge */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-400">
                  {t('recommendation.result.recommendedCrop')}
                </p>
                <h2 className="mt-1.5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  {t(getCropTranslationKey(bestCropName))}
                </h2>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${confidence.bg} ${confidence.text} ${confidence.ring}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${confidence.dot}`} />
                {percent}%
              </span>
            </div>

            {/* Confidence bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-slate-400 tracking-[0.07em] uppercase">{t('recommendation.result.confidence')}</span>
                <span className={`text-[11px] font-semibold ${confidence.text}`}>
                  {confidence.label === 'High confidence' ? t('disease.confidence.high') :
                   confidence.label === 'Moderate confidence' ? t('disease.confidence.moderate') :
                   confidence.label === 'Low confidence' ? t('disease.confidence.low') : confidence.label}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${t('recommendation.result.confidence')}: ${percent}%`}>
                <div
                  className={`h-full rounded-full transition-all duration-700 ${confidence.bar}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>

            {/* Reasoning */}
            <div className="mt-5 border-t border-slate-100 pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-400">{t('recommendation.result.whyThisCrop')}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{displayReasoning}</p>
              <ListenButton
                text={displayReasoning}
                languageCode={toSpeechLocale(language)}
              />
            </div>

            {/* Weather signal */}
            <div className="mt-5">
              {result.is_dry_spell ? (
                <div className="flex items-start gap-2.5 rounded-xl border border-accent-amber/20 bg-accent-amber/5 p-3.5">
                  <span className="mt-0.5 shrink-0 text-accent-amber">{WarningIcon}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{t('recommendation.result.drySpell')}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                      {t('recommendation.result.drySpellDetail')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <span className="mt-0.5 shrink-0 text-primary-green">✔</span>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{t('recommendation.result.adequateRain')}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      {t('recommendation.result.adequateRainDetail')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {result.error && (
              <p className="mt-4 text-xs leading-relaxed text-slate-400">
                {t('recommendation.result.fallbackAdvice')}
              </p>
            )}
          </div>

          {/* Footer action */}
          <div className="border-t border-slate-100 px-5 py-3.5 sm:px-6 bg-slate-50/50">
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 rounded"
            >
              {RefreshIcon}
              {t('recommendation.result.tryDifferentSoil')}
            </button>
          </div>
        </section>

        {/* Detailed advice */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AdvisoryCard
              emoji="🌱"
              title={t('recommendation.advisory.fertilizationTip')}
              body={displayFert?.trim() ? displayFert : t('recommendation.advisory.unavailable')}
              languageCode={toSpeechLocale(language)}
            />
            <AdvisoryCard
              emoji="💧"
              title={t('recommendation.advisory.irrigationAdvice')}
              body={displayIrr?.trim() ? displayIrr : t('recommendation.advisory.unavailable')}
              languageCode={toSpeechLocale(language)}
            />
          </div>
        </div>
      </EntranceAnimation>
    )
  },
)


// ── Alternative Recommendations Card ────────────────────────────────────────
function AlternativesCard({
  result,
  language,
}: {
  result: Recommendation
  language: LanguageCode
}) {
  const { t } = useLanguage()
  const pt = (key: string) => {
    return PAGE_TRANSLATIONS[language]?.[key] ?? PAGE_TRANSLATIONS['en']?.[key] ?? key
  }

  return (
    <EntranceAnimation>
      <section aria-label="Alternative recommendations" className="mt-8">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
          {pt('rec.alternativeCrops')}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {result.alternatives.map((crop, idx) => {
            const medal = idx === 0 ? '🥈' : '🥉'
            const suitability = crop.suitabilityScore

            const suitColor =
              suitability >= 90
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/10'
                : suitability >= 80
                  ? 'bg-amber-50 text-amber-700 ring-amber-600/10'
                  : 'bg-rose-50 text-rose-700 ring-rose-600/10'

            const risk = crop.riskLevel
            const riskColor =
              risk === 'Low'
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/10'
                : risk === 'Medium'
                  ? 'bg-amber-50 text-amber-700 ring-amber-600/10'
                  : 'bg-rose-50 text-rose-700 ring-rose-600/10'

            const profit = crop.profitPotential
            const profitColor =
              profit === 'High'
                ? 'bg-indigo-50 text-indigo-700 ring-indigo-600/10'
                : profit === 'Medium'
                  ? 'bg-blue-50 text-blue-700 ring-blue-600/10'
                  : 'bg-slate-50 text-slate-700 ring-slate-600/10'

            return (
              <div
                key={crop.cropName}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-lg font-bold text-slate-800 flex items-center gap-1.5">
                      <span>{medal}</span>
                      <span>{t(getCropTranslationKey(crop.cropName))}</span>
                    </h4>
                  </div>
                  <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${suitColor}`}>
                    {suitability}%
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${profitColor}`}>
                    {pt(`rec.${profit.toLowerCase()}`)} {pt('rec.profit')}
                  </span>
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${riskColor}`}>
                    {pt(`rec.${risk.toLowerCase()}`)} {pt('rec.risk')}
                  </span>
                </div>

                <ul className="mt-3 space-y-1 text-xs text-slate-500">
                  {crop.primaryReasons.slice(0, 2).map((reason, rIdx) => (
                    <li key={rIdx} className="flex items-start gap-1">
                      <span className="text-slate-400 font-bold">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-2.5 text-xs text-slate-600 leading-relaxed italic border-t border-slate-50 pt-2">
                  {crop.summary}
                </p>
              </div>
            )
          })}
        </div>
      </section>
    </EntranceAnimation>
  )
}

// ── Advanced Insights Accordions ──────────────────────────────────────────
function AdvancedInsightsAccordions({
  result,
  language,
  weather,
  soil,
  soilMoisture,
  moistureLevel,
  computedVegIndex,
}: {
  result: Recommendation
  language: LanguageCode
  weather: { temperature: number; rainfall: number } | null
  soil: string
  soilMoisture: number
  moistureLevel: string
  computedVegIndex: { status: string }
}) {
  const { t } = useLanguage()
  const pt = (key: string) => {
    return PAGE_TRANSLATIONS[language]?.[key] ?? PAGE_TRANSLATIONS['en']?.[key] ?? key
  }

  const ttsText = `${pt('rec.bestChoice')} ${t(getCropTranslationKey(result.bestCrop.cropName))}. ${pt('rec.suitabilityScore')}: ${result.bestCrop.suitabilityScore} percent. ${result.bestCrop.summary} ${t('recommendation.advisory.irrigationAdvice')}: ${result.bestCrop.irrigation_advice}`

  return (
    <EntranceAnimation>
      <div className="mt-8 space-y-4">
        {/* Accordion 1: Detailed AI Reasoning */}
        <Accordion title={pt('rec.detailedReasoning')}>
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-slate-600">
              {result.bestCrop.summary}
            </p>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3 bg-slate-50/50 p-3 rounded-xl">
              <span className="text-xs text-slate-400 font-medium">Listen to AI summary</span>
              <ListenButton text={ttsText} languageCode={toSpeechLocale(language)} />
            </div>
          </div>
        </Accordion>

        {/* Accordion 2: Weather Analysis */}
        <Accordion title={pt('rec.weatherAnalysis')}>
          {weather ? (
            <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-center">
                <span className="block text-slate-400 font-medium">{pt('rec.aveTemp')}</span>
                <span className="mt-1 block text-sm font-semibold text-slate-800">{Math.round(weather.temperature)}°C</span>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-center">
                <span className="block text-slate-400 font-medium">{pt('rec.expRain')}</span>
                <span className="mt-1 block text-sm font-semibold text-slate-800">{weather.rainfall} mm</span>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-center col-span-2 sm:col-span-1">
                <span className="block text-slate-400 font-medium">{pt('rec.drySpell')}</span>
                <span className="mt-1 block text-sm font-semibold text-slate-800">
                  {result.is_dry_spell ? 'Yes ⚠️' : 'No'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">{t('recommendation.weatherUnavailable')}</p>
          )}
        </Accordion>

        {/* Accordion 3: Environmental Factors */}
        <Accordion title={pt('rec.environmentalFactors')}>
          <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-center">
              <span className="block text-slate-400 font-medium">{pt('rec.soilType')}</span>
              <span className="mt-1 block text-sm font-semibold text-slate-800">{t(`soil.${soil}` as TranslationKey)}</span>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-center">
              <span className="block text-slate-400 font-medium">{pt('rec.soilMoisture')}</span>
              <span className="mt-1 block text-sm font-semibold text-slate-800">{soilMoisture}% ({moistureLevel})</span>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-center col-span-2 sm:col-span-1">
              <span className="block text-slate-400 font-medium">{pt('rec.vegStatus')}</span>
              <span className="mt-1 block text-sm font-semibold text-slate-800">{computedVegIndex.status}</span>
            </div>
          </div>
        </Accordion>

        {/* Accordion 4: Recommendation Logic */}
        <Accordion title={pt('rec.recommendationLogic')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AdvisoryCard
              emoji="🌱"
              title={t('recommendation.advisory.fertilizationTip')}
              body={result.bestCrop.fertilization_tip?.trim() ? result.bestCrop.fertilization_tip : t('recommendation.advisory.unavailable')}
              languageCode={toSpeechLocale(language)}
            />
            <AdvisoryCard
              emoji="💧"
              title={t('recommendation.advisory.irrigationAdvice')}
              body={result.bestCrop.irrigation_advice?.trim() ? result.bestCrop.irrigation_advice : t('recommendation.advisory.unavailable')}
              languageCode={toSpeechLocale(language)}
            />
          </div>
        </Accordion>
      </div>
    </EntranceAnimation>
  )
}

// ── Advisory card (fertilization / irrigation) ──────────────────────────────

/**
 * A compact card matching the recommendation card's design system: same border
 * radius, border, shadow, and typography, with a subtle green accent header.
 */
function AdvisoryCard({
  emoji,
  title,
  body,
  languageCode,
}: {
  emoji: string
  title: string
  body: string
  languageCode: string
}) {
  const { t } = useLanguage()
  return (
    <section className="rounded-2xl border border-primary-green/15 bg-primary-green/5 p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-green/10 text-base"
          aria-hidden="true"
        >
          {emoji}
        </span>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-primary-green">
          {title}
        </h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{body}</p>
      {body !== t('recommendation.advisory.unavailable') && (
        <ListenButton text={body} languageCode={languageCode} />
      )}
    </section>
  )
}

// ── Accordion (collapsed by default; keyboard + SR friendly) ─────────────────

/**
 * A generic disclosure used to keep secondary detail out of the primary flow.
 * Follows the app's existing `aria-expanded` pattern (see VegetationIndexCard).
 */
function Accordion({
  title,
  children,
  className = '',
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-green/40 sm:px-6"
      >
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <span className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          {ChevronIcon}
        </span>
      </button>
      {open && <div className="border-t border-slate-100 p-4 sm:p-5">{children}</div>}
    </div>
  )
}



// ── Loading skeleton (mirrors the result card) ──────────────────────────────

function ResultSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="animate-pulse p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2.5">
            <div className="h-2 w-28 rounded bg-slate-100" />
            <div className="h-7 w-44 rounded-md bg-slate-200" />
          </div>
          <div className="h-6 w-20 rounded-full bg-slate-100" />
        </div>
        {/* Confidence bar skeleton */}
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between">
            <div className="h-2 w-20 rounded bg-slate-100" />
            <div className="h-2 w-24 rounded bg-slate-100" />
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100" />
        </div>
        {/* Reasoning skeleton */}
        <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-5">
          <div className="h-2 w-24 rounded bg-slate-100" />
          <div className="h-3.5 w-full rounded bg-slate-100" />
          <div className="h-3.5 w-11/12 rounded bg-slate-100" />
          <div className="h-3.5 w-4/5 rounded bg-slate-100" />
        </div>
        {/* Weather signal skeleton */}
        <div className="mt-5 h-16 w-full rounded-xl bg-slate-100" />
      </div>
      <div className="border-t border-slate-100 px-6 py-3.5 sm:px-7">
        <div className="h-3.5 w-36 rounded bg-slate-100" />
      </div>
    </section>
  )
}

// ── Page init skeleton ──────────────────────────────────────────────────────

function InitSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden="true">
      {/* District skeleton */}
      <div className="space-y-1.5">
        <div className="h-3.5 w-16 rounded bg-slate-200" />
        <div className="h-10 w-full rounded-lg bg-slate-200" />
      </div>
      {/* Soil grid skeleton */}
      <div className="space-y-2.5">
        <div className="h-3.5 w-20 rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-200" />
          ))}
        </div>
      </div>
      {/* Button skeleton */}
      <div className="h-11 w-full rounded-lg bg-slate-200" />
    </div>
  )
}

// ── Small building blocks ───────────────────────────────────────────────────

function NoticeCard({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <EmptyState
      title={title}
      description={body}
      action={action}
    />
  )
}

function LoadingDots() {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}
