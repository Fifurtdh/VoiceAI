import type { LanguageCode } from '../types/khata.ts';

export interface LanguageOption {
  code: LanguageCode;
  nativeName: string;
  englishName: string;
  speechLang: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', speechLang: 'hi-IN' },
  { code: 'kn', nativeName: 'ಕನ್ನಡ', englishName: 'Kannada', speechLang: 'kn-IN' },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', speechLang: 'ta-IN' },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu', speechLang: 'te-IN' },
  { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi', speechLang: 'mr-IN' },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', speechLang: 'bn-IN' },
  { code: 'en', nativeName: 'English', englishName: 'English', speechLang: 'en-IN' },
];

export interface TranslationStrings {
  namaste: string;
  aiVoiceAssistant: string;
  aiDisclosureSpeech: string;
  homePrompt: string;
  talkToKhata: string;
  talkSubtitle: string;
  ledger: string;
  reminders: string;
  todayUdhaar: string;
  todayPayments: string;
  totalOutstanding: string;
  recentEntries: string;
  seeAll: string;
  noEntriesYet: string;
  creditGiven: string;
  paymentReceived: string;
  today: string;
  yesterday: string;
  edit: string;
  undo: string;
  delete: string;
  confirm: string;
  cancel: string;
  save: string;
  khataAssistant: string;
  online: string;
  offline: string;
  demoActive: string;
  tapOrHoldMic: string;
  listeningHint: string;
  thinkingHint: string;
  speakingHint: string;
  typeEntryPlaceholder: string;
  send: string;
  whichCustomer: string;
  searchCustomers: string;
  outstandingBalance: string;
  settled: string;
  advance: string;
  remindersOk: string;
  remindersOffHint: string;
  sendPoliteReminder: string;
  optedInCustomers: string;
  noOptedInCustomers: string;
  settings: string;
  appearance: string;
  darkMode: string;
  lightMode: string;
  language: string;
  shopName: string;
  voiceBackendUrl: string;
  voiceBackendHelp: string;
  demoMode: string;
  demoModeHelp: string;
  deleteAllData: string;
  deleteAllConfirmTitle: string;
  deleteAllConfirmBody: string;
  copyMessage: string;
  copied: string;
  openSms: string;
  openWhatsApp: string;
  back: string;
  noCustomersFound: string;
  transactionHistory: string;
  politeReminderTemplate: (customerName: string, shopName: string, amountText: string) => string;
  todaySummaryAnswer: (received: string, credit: string, outstanding: string) => string;
  entrySavedSpeech: (customerName: string, amountText: string, direction: 'credit' | 'payment') => string;
  customerBalanceAnswer: (customerName: string, amountText: string, settled: boolean, advance: boolean) => string;
}

export const TRANSLATIONS: Record<LanguageCode, TranslationStrings> = {
  en: {
    namaste: 'Namaste',
    aiVoiceAssistant: 'AI voice assistant',
    aiDisclosureSpeech: 'Namaste! I am an AI assistant for your shop khata. How can I help?',
    homePrompt: 'Aaj kya likhna hai?',
    talkToKhata: 'Talk to Khata',
    talkSubtitle: 'Speak across the counter',
    ledger: 'Ledger',
    reminders: 'Reminders',
    todayUdhaar: "Today's udhaar",
    todayPayments: "Today's received",
    totalOutstanding: 'Total due',
    recentEntries: 'Recent entries',
    seeAll: 'See all',
    noEntriesYet: 'No entries recorded yet. Tap Talk to Khata to add one.',
    creditGiven: 'Credit given',
    paymentReceived: 'Payment received',
    today: 'Today',
    yesterday: 'Yesterday',
    edit: 'Edit',
    undo: 'Undo',
    delete: 'Delete',
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    khataAssistant: 'Khata Assistant',
    online: 'Online',
    offline: 'Local',
    demoActive: 'Demo active',
    tapOrHoldMic: 'Hold to speak or tap mic',
    listeningHint: 'Listening... speak naturally',
    thinkingHint: 'Understanding entry...',
    speakingHint: 'Speaking...',
    typeEntryPlaceholder: 'e.g. Ramesh ka 340 udhaar, Sita ne 200 diye, aaj kitna mila?',
    send: 'Send',
    whichCustomer: 'Which customer?',
    searchCustomers: 'Search customer name or phone...',
    outstandingBalance: 'Outstanding balance',
    settled: 'Settled',
    advance: 'Advance',
    remindersOk: 'Reminders OK',
    remindersOffHint: 'Turn on Reminders OK only if the customer agreed to gentle reminders.',
    sendPoliteReminder: 'Send polite reminder',
    optedInCustomers: 'Opted-in customers',
    noOptedInCustomers: 'No customers have opted in for reminders yet. Enable "Reminders OK" inside a customer ledger.',
    settings: 'Settings',
    appearance: 'Display theme',
    darkMode: 'Dark',
    lightMode: 'Light (Sunlight)',
    language: 'Language',
    shopName: 'Shop name',
    voiceBackendUrl: 'Voice backend WebSocket URL',
    voiceBackendHelp: 'Optional. Streams 16kHz PCM audio chunks and receives JSON transcripts & audio.',
    demoMode: 'Demo mode',
    demoModeHelp: 'Simulates voice sessions offline with 6 sample customers.',
    deleteAllData: 'Delete all data',
    deleteAllConfirmTitle: 'Delete all khata data?',
    deleteAllConfirmBody: 'This permanently removes all customers and ledger entries stored on this device.',
    copyMessage: 'Copy message',
    copied: 'Copied',
    openSms: 'SMS',
    openWhatsApp: 'WhatsApp',
    back: 'Back',
    noCustomersFound: 'No matching customers found.',
    transactionHistory: 'Transaction history',
    politeReminderTemplate: (customerName, shopName, amountText) =>
      `Namaste ${customerName} ji, a gentle note from ${shopName} about your balance of Rs ${amountText}. Pay whenever convenient. Thank you!`,
    todaySummaryAnswer: (received, credit, outstanding) =>
      `Today you received Rs ${received} and gave Rs ${credit} udhaar. Total outstanding is Rs ${outstanding}.`,
    entrySavedSpeech: (customerName, amountText, direction) =>
      direction === 'credit'
        ? `${customerName} ka ${amountText} rupaye udhaar add ho gaya.`
        : `${customerName} ka ${amountText} rupaye payment record ho gaya.`,
    customerBalanceAnswer: (customerName, amountText, settled, advance) =>
      settled
        ? `${customerName} ka hisaab clear hai, koi baki nahi hai.`
        : advance
        ? `${customerName} ka Rs ${amountText} advance jama hai.`
        : `${customerName} owes Rs ${amountText}.`,
  },
  hi: {
    namaste: 'नमस्ते',
    aiVoiceAssistant: 'AI वॉइस असिस्टेंट',
    aiDisclosureSpeech: 'नमस्ते! मैं आपके दुकान खाते का AI असिस्टेंट हूँ। आज क्या लिखना है?',
    homePrompt: 'आज क्या लिखना है?',
    talkToKhata: 'खाते से बात करें',
    talkSubtitle: 'बोलकर हिसाब लिखें',
    ledger: 'खाता बही',
    reminders: 'रिमाइंडर',
    todayUdhaar: 'आज का उधार',
    todayPayments: 'आज की वसूली',
    totalOutstanding: 'कुल बकाया',
    recentEntries: 'हाल की एंट्री',
    seeAll: 'सभी देखें',
    noEntriesYet: 'अभी कोई एंट्री नहीं है। बोलकर जोड़ने के लिए माइक दबाएं।',
    creditGiven: 'उधार दिया',
    paymentReceived: 'पैसे मिले',
    today: 'आज',
    yesterday: 'कल',
    edit: 'बदलें',
    undo: 'वापस लें',
    delete: 'हटाएं',
    confirm: 'पक्का करें',
    cancel: 'रद्द करें',
    save: 'सहेजें',
    khataAssistant: 'खाता असिस्टेंट',
    online: 'ऑनलाइन',
    offline: 'लोकल',
    demoActive: 'डेमो चालू',
    tapOrHoldMic: 'बोलने के लिए दबाएं या दबाए रखें',
    listeningHint: 'सुन रहा हूँ... बोलिए',
    thinkingHint: 'समझ रहा हूँ...',
    speakingHint: 'बोल रहा हूँ...',
    typeEntryPlaceholder: 'जैसे: रमेश का 340 उधार, सीता ने 200 दिए, आज कितना मिला?',
    send: 'भेजें',
    whichCustomer: 'कौन से ग्राहक?',
    searchCustomers: 'ग्राहक का नाम या नंबर खोजें...',
    outstandingBalance: 'कुल बकाया',
    settled: 'हिसाब बराबर',
    advance: 'एडवांस जमा',
    remindersOk: 'रिमाइंडर की अनुमति',
    remindersOffHint: 'ग्राहक की सहमति होने पर ही रिमाइंडर चालू करें।',
    sendPoliteReminder: 'विनम्र रिमाइंडर भेजें',
    optedInCustomers: 'अनुमति वाले ग्राहक',
    noOptedInCustomers: 'अभी किसी ग्राहक ने रिमाइंडर के लिए सहमति नहीं दी है।',
    settings: 'सेटिंग्स',
    appearance: 'स्क्रीन थीम',
    darkMode: 'डार्क',
    lightMode: 'लाइट (धूप के लिए)',
    language: 'भाषा',
    shopName: 'दुकान का नाम',
    voiceBackendUrl: 'वॉइस बैकएंड WebSocket URL',
    voiceBackendHelp: 'वैकल्पिक। 16kHz PCM ऑडियो भेजता है और JSON उत्तर प्राप्त करता है।',
    demoMode: 'डेमो मोड',
    demoModeHelp: '6 नमूना ग्राहकों के साथ ऑफ़लाइन वॉइस सत्र चलाता है।',
    deleteAllData: 'सारा डेटा मिटाएं',
    deleteAllConfirmTitle: 'सारा खाता डेटा मिटाएं?',
    deleteAllConfirmBody: 'इससे इस फ़ोन में सहेजे सभी ग्राहक और लेन-देन हमेशा के लिए हट जाएंगे।',
    copyMessage: 'संदेश कॉपी करें',
    copied: 'कॉपी हो गया',
    openSms: 'SMS',
    openWhatsApp: 'WhatsApp',
    back: 'पीछे',
    noCustomersFound: 'कोई ग्राहक नहीं मिला।',
    transactionHistory: 'लेन-देन का इतिहास',
    politeReminderTemplate: (customerName, shopName, amountText) =>
      `नमस्ते ${customerName} जी, ${shopName} की ओर से आपके ₹${amountText} बकाया की विनम्र सूचना। सुविधा अनुसार भुगतान करें। धन्यवाद!`,
    todaySummaryAnswer: (received, credit, outstanding) =>
      `आज ₹${received} मिले और ₹${credit} उधार दिया गया। कुल बकाया ₹${outstanding} है।`,
    entrySavedSpeech: (customerName, amountText, direction) =>
      direction === 'credit'
        ? `${customerName} का ${amountText} रुपये उधार जुड़ गया।`
        : `${customerName} का ${amountText} रुपये पेमेंट जमा हो गया।`,
    customerBalanceAnswer: (customerName, amountText, settled, advance) =>
      settled
        ? `${customerName} का हिसाब बराबर है, कोई बकाया नहीं है।`
        : advance
        ? `${customerName} के ${amountText} रुपये एडवांस जमा हैं।`
        : `${customerName} का ${amountText} रुपये बकाया है।`,
  },
  kn: {
    namaste: 'ನಮಸ್ಕಾರ',
    aiVoiceAssistant: 'AI ಧ್ವನಿ ಸಹಾಯಕ',
    aiDisclosureSpeech: 'ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ ಅಂಗಡಿ ಖಾತೆಯ AI ಸಹಾಯಕ. ಇಂದು ಏನು ಬರೆಯಬೇಕು?',
    homePrompt: 'ಇಂದು ಏನು ಬರೆಯಬೇಕು?',
    talkToKhata: 'ಖಾತೆಯೊಂದಿಗೆ ಮಾತನಾಡಿ',
    talkSubtitle: 'ಮಾತನಾಡಿ ಲೆಕ್ಕ ಬರೆಯಿರಿ',
    ledger: 'ಖಾತೆ ಪುಸ್ತಕ',
    reminders: 'ನೆನಪಿಸುವಿಕೆ',
    todayUdhaar: 'ಇಂದಿನ ಸಾಲ',
    todayPayments: 'ಇಂದಿನ ಜಮಾ',
    totalOutstanding: 'ಒಟ್ಟು ಬಾಕಿ',
    recentEntries: 'ಇತ್ತೀಚಿನ ದಾಖಲೆಗಳು',
    seeAll: 'ಎಲ್ಲಾ ನೋಡಿ',
    noEntriesYet: 'ಇನ್ನೂ ಯಾವುದೇ ದಾಖಲೆ ಇಲ್ಲ.',
    creditGiven: 'ಸಾಲ ನೀಡಲಾಗಿದೆ',
    paymentReceived: 'ಹಣ ಬಂದಿದೆ',
    today: 'ಇಂದು',
    yesterday: 'ನಿನ್ನೆ',
    edit: 'ತಿದ್ದು',
    undo: 'ಹಿಂಪಡೆ',
    delete: 'ಅಳಿಸು',
    confirm: 'ಖಚಿತಪಡಿಸಿ',
    cancel: 'ರದ್ದುಮಾಡಿ',
    save: 'ಉಳಿಸಿ',
    khataAssistant: 'ಖಾತೆ ಸಹಾಯಕ',
    online: 'ಆನ್‌ಲೈನ್',
    offline: 'ಲೋಕಲ್',
    demoActive: 'ಡೆಮೋ ಸಕ್ರಿಯ',
    tapOrHoldMic: 'ಮಾತನಾಡಲು ಮೈಕ್ ಒತ್ತಿ',
    listeningHint: 'ಕೇಳಿಸಿಕೊಳ್ಳುತ್ತಿದ್ದೇನೆ...',
    thinkingHint: 'ಅರ್ಥಮಾಡಿಕೊಳ್ಳುತ್ತಿದೆ...',
    speakingHint: 'ಮಾತನಾಡುತ್ತಿದೆ...',
    typeEntryPlaceholder: 'ಉದಾ: ರಮೇಶ್ 340 ಸಾಲ, ಸೀತಾ 200 ಜಮಾ, ಇಂದು ಎಷ್ಟು ಬಾಕಿ?',
    send: 'ಕಳುಹಿಸಿ',
    whichCustomer: 'ಯಾವ ಗ್ರಾಹಕರು?',
    searchCustomers: 'ಗ್ರಾಹಕರ ಹೆಸರು ಹುಡುಕಿ...',
    outstandingBalance: 'ಬಾಕಿ ಮೊತ್ತ',
    settled: 'ಚುಕ್ತಾ',
    advance: 'ಮುಂಗಡ',
    remindersOk: 'ನೆನಪಿಸುವಿಕೆ ಸಮ್ಮತಿ',
    remindersOffHint: 'ಗ್ರಾಹಕರ ಒಪ್ಪಿಗೆ ಇದ್ದರೆ ಮಾತ್ರ ಆನ್ ಮಾಡಿ.',
    sendPoliteReminder: 'ವಿನಯಪೂರ್ವಕ ನೆನಪು ಕಳುಹಿಸಿ',
    optedInCustomers: 'ಒಪ್ಪಿಗೆ ನೀಡಿದ ಗ್ರಾಹಕರು',
    noOptedInCustomers: 'ಯಾವುದೇ ಗ್ರಾಹಕರು ಇನ್ನೂ ಒಪ್ಪಿಗೆ ನೀಡಿಲ್ಲ.',
    settings: 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
    appearance: 'ಥೀಮ್',
    darkMode: 'ಡಾರ್ಕ್',
    lightMode: 'ಲೈಟ್ (ಬಿಸಿಲಿಗಾಗಿ)',
    language: 'ಭಾಷೆ',
    shopName: 'ಅಂಗಡಿ ಹೆಸರು',
    voiceBackendUrl: 'ವಾಯ್ಸ್ ಬ್ಯಾಕೆಂಡ್ WebSocket URL',
    voiceBackendHelp: 'ಐಚ್ಛಿಕ. 16kHz PCM ಆಡಿಯೋ ಸ್ಟ್ರೀಮ್ ಮಾಡುತ್ತದೆ.',
    demoMode: 'ಡೆಮೋ ಮೋಡ್',
    demoModeHelp: '6 ಮಾದರಿ ಗ್ರಾಹಕರೊಂದಿಗೆ ಆಫ್‌ಲೈನ್ ಧ್ವನಿ ಪರೀಕ್ಷೆ.',
    deleteAllData: 'ಎಲ್ಲಾ ಡೇಟಾ ಅಳಿಸಿ',
    deleteAllConfirmTitle: 'ಎಲ್ಲಾ ಖಾತೆ ಡೇಟಾ ಅಳಿಸುವುದೇ?',
    deleteAllConfirmBody: 'ಈ ಸಾಧನದಲ್ಲಿನ ಎಲ್ಲಾ ಗ್ರಾಹಕರು ಮತ್ತು ಲೆಕ್ಕಗಳು ಅಳಿಸಲ್ಪಡುತ್ತವೆ.',
    copyMessage: 'ಸಂದೇಶ ನಕಲಿಸಿ',
    copied: 'ನಕಲಿಸಲಾಗಿದೆ',
    openSms: 'SMS',
    openWhatsApp: 'WhatsApp',
    back: 'ಹಿಂದೆ',
    noCustomersFound: 'ಯಾವುದೇ ಗ್ರಾಹಕರು ಸಿಗಲಿಲ್ಲ.',
    transactionHistory: 'ವಹಿವಾಟು ಇತಿಹಾಸ',
    politeReminderTemplate: (customerName, shopName, amountText) =>
      `ನಮಸ್ಕಾರ ${customerName} ಅವರೇ, ${shopName} ವತಿಯಿಂದ ₹${amountText} ಬಾಕಿಯ ವಿನಯಪೂರ್ವಕ ಮಾಹಿತಿ. ಅನುಕೂಲವಾದಾಗ ಪಾವತಿಸಿ. ಧನ್ಯವಾದಗಳು!`,
    todaySummaryAnswer: (received, credit, outstanding) =>
      `ಇಂದು ₹${received} ಬಂದಿದೆ ಮತ್ತು ₹${credit} ಸಾಲ ನೀಡಲಾಗಿದೆ. ಒಟ್ಟು ಬಾಕಿ ₹${outstanding}.`,
    entrySavedSpeech: (customerName, amountText, direction) =>
      direction === 'credit'
        ? `${customerName} ಅವರ ${amountText} ರೂಪಾಯಿ ಸಾಲ ಸೇರಿಸಲಾಗಿದೆ.`
        : `${customerName} ಅವರ ${amountText} ರೂಪಾಯಿ ಜಮಾ ದಾಖಲಾಗಿದೆ.`,
    customerBalanceAnswer: (customerName, amountText, settled, advance) =>
      settled
        ? `${customerName} ಅವರ ಲೆಕ್ಕ ಚುಕ್ತಾ ಆಗಿದೆ.`
        : advance
        ? `${customerName} ಅವರ ${amountText} ರೂಪಾಯಿ ಮುಂಗಡ ಜಮಾ ಇದೆ.`
        : `${customerName} ಅವರ ${amountText} ರೂಪಾಯಿ ಬಾಕಿ ಇದೆ.`,
  },
  ta: {
    namaste: 'வணக்கம்',
    aiVoiceAssistant: 'AI குரல் உதவியாளர்',
    aiDisclosureSpeech: 'வணக்கம்! நான் உங்கள் கடை கணக்கிற்கான AI உதவியாளர். இன்று என்ன எழுத வேண்டும்?',
    homePrompt: 'இன்று என்ன எழுத வேண்டும்?',
    talkToKhata: 'கணக்குடன் பேசுங்கள்',
    talkSubtitle: 'பேசி கணக்கு எழுதுங்கள்',
    ledger: 'கணக்குப் புத்தகம்',
    reminders: 'நினைவூட்டல்கள்',
    todayUdhaar: 'இன்றைய கடன்',
    todayPayments: 'இன்றைய வரவு',
    totalOutstanding: 'மொத்த பாக்கி',
    recentEntries: 'சமீபத்திய பதிவுகள்',
    seeAll: 'அனைத்தும்',
    noEntriesYet: 'இன்னும் பதிவுகள் இல்லை.',
    creditGiven: 'கடன் கொடுத்தது',
    paymentReceived: 'பணம் வந்தது',
    today: 'இன்று',
    yesterday: 'நேற்று',
    edit: 'திருத்து',
    undo: 'ரத்து செய்',
    delete: 'நீக்கு',
    confirm: 'உறுதி செய்',
    cancel: 'ரத்து',
    save: 'சேமி',
    khataAssistant: 'கணக்கு உதவியாளர்',
    online: 'ஆன்லைன்',
    offline: 'லோக்கல்',
    demoActive: 'டெமோ இயக்கம்',
    tapOrHoldMic: 'பேச மைக்கை அழுத்தவும்',
    listeningHint: 'கேட்கிறேன்... பேசுங்கள்',
    thinkingHint: 'புரிந்துகொள்கிறது...',
    speakingHint: 'பேசுகிறது...',
    typeEntryPlaceholder: 'உதா: Ramesh ka 340 udhaar, Sita ne 200 diye',
    send: 'அனுப்பு',
    whichCustomer: 'எந்த வாடிக்கையாளர்?',
    searchCustomers: 'வாடிக்கையாளர் பெயர் தேடு...',
    outstandingBalance: 'மொத்த பாக்கி',
    settled: 'முடிந்தது',
    advance: 'முன்பணம்',
    remindersOk: 'நினைவூட்டல் அனுமதி',
    remindersOffHint: 'வாடிக்கையாளர் சம்மதம் இருந்தால் மட்டும் இயக்கவும்.',
    sendPoliteReminder: 'பணிவான நினைவூட்டல் அனுப்பு',
    optedInCustomers: 'சம்மதித்த வாடிக்கையாளர்கள்',
    noOptedInCustomers: 'இன்னும் யாரும் நினைவூட்டலுக்கு சம்மதிக்கவில்லை.',
    settings: 'அமைப்புகள்',
    appearance: 'தோற்றம்',
    darkMode: 'டார்க்',
    lightMode: 'லைட் (வெயிலுக்கு)',
    language: 'மொழி',
    shopName: 'கடை பெயர்',
    voiceBackendUrl: 'குரல் WebSocket URL',
    voiceBackendHelp: 'விருப்பமானது. 16kHz PCM ஆடியோ அனுப்பும்.',
    demoMode: 'டெமோ முறை',
    demoModeHelp: '6 மாதிரி வாடிக்கையாளர்களுடன் ஆஃப்லைன் குரல் சோதனை.',
    deleteAllData: 'அனைத்து தரவையும் அழி',
    deleteAllConfirmTitle: 'அனைத்து தரவையும் அழிக்கவா?',
    deleteAllConfirmBody: 'இந்த சாதனத்தில் உள்ள அனைத்து பதிவுகளும் நீக்கப்படும்.',
    copyMessage: 'நகலெடு',
    copied: 'நகலெடுக்கப்பட்டது',
    openSms: 'SMS',
    openWhatsApp: 'WhatsApp',
    back: 'பின்',
    noCustomersFound: 'வாடிக்கையாளர் இல்லை.',
    transactionHistory: 'பரிவர்த்தனை வரலாறு',
    politeReminderTemplate: (customerName, shopName, amountText) =>
      `வணக்கம் ${customerName} அவர்களே, ${shopName} சார்பாக உங்கள் ₹${amountText} பாக்கி குறித்த அன்பான தகவல். வசதியான போது செலுத்தவும். நன்றி!`,
    todaySummaryAnswer: (received, credit, outstanding) =>
      `இன்று ₹${received} வரவு மற்றும் ₹${credit} கடன். மொத்த பாக்கி ₹${outstanding}.`,
    entrySavedSpeech: (customerName, amountText, direction) =>
      direction === 'credit'
        ? `${customerName} கணக்கில் ${amountText} ரூபாய் கடன் சேர்க்கப்பட்டது.`
        : `${customerName} கணக்கில் ${amountText} ரூபாய் வரவு சேர்க்கப்பட்டது.`,
    customerBalanceAnswer: (customerName, amountText, settled, advance) =>
      settled
        ? `${customerName} கணக்கு முடிந்துவிட்டது.`
        : advance
        ? `${customerName} ${amountText} ரூபாய் முன்பணம் வைத்துள்ளார்.`
        : `${customerName} ${amountText} ரூபாய் பாக்கி வைத்துள்ளார்.`,
  },
  te: {
    namaste: 'నమస్కారం',
    aiVoiceAssistant: 'AI వాయిస్ అసిస్టెంట్',
    aiDisclosureSpeech: 'నమస్కారం! నేను మీ దుకాణం ఖాతా AI సహాయకుడిని. ఈరోజు ఏమి రాయాలి?',
    homePrompt: 'ఈరోజు ఏమి రాయాలి?',
    talkToKhata: 'ఖాతాతో మాట్లాడండి',
    talkSubtitle: 'మాట్లాడి లెక్క రాయండి',
    ledger: 'ఖాతా పుస్తకం',
    reminders: 'గుర్తుచేయడం',
    todayUdhaar: 'ఈరోజు అప్పు',
    todayPayments: 'ఈరోజు జమ',
    totalOutstanding: 'మొత్తం బాకీ',
    recentEntries: 'ఇటీవలి ఎంట్రీలు',
    seeAll: 'అన్నీ చూడండి',
    noEntriesYet: 'ఇంకా ఎంట్రీలు లేవు.',
    creditGiven: 'అప్పు ఇచ్చాము',
    paymentReceived: 'డబ్బు వచ్చింది',
    today: 'ఈరోజు',
    yesterday: 'నిన్న',
    edit: 'మార్చు',
    undo: 'వెనక్కి',
    delete: 'తొలగించు',
    confirm: 'నిర్ధారించు',
    cancel: 'రద్దు',
    save: 'సేవ్',
    khataAssistant: 'ఖాతా సహాయకుడు',
    online: 'ఆన్‌లైన్',
    offline: 'లోకల్',
    demoActive: 'డెమో ఆన్',
    tapOrHoldMic: 'మాట్లాడటానికి మైక్ నొక్కండి',
    listeningHint: 'వింటున్నాను... మాట్లాడండి',
    thinkingHint: 'అర్థం చేసుకుంటోంది...',
    speakingHint: 'మాట్లాడుతోంది...',
    typeEntryPlaceholder: 'ఉదా: Ramesh ka 340 udhaar, Sita ne 200 diye',
    send: 'పంపు',
    whichCustomer: 'ఏ కస్టమర్?',
    searchCustomers: 'కస్టమర్ పేరు వెతకండి...',
    outstandingBalance: 'మొత్తం బాకీ',
    settled: 'సరిపోయింది',
    advance: 'అడ్వాన్స్',
    remindersOk: 'రిమైండర్లకు సమ్మతి',
    remindersOffHint: 'కస్టమర్ అంగీకారంతో మాత్రమే ఆన్ చేయండి.',
    sendPoliteReminder: 'మర్యాదపూర్వక రిమైండర్ పంపండి',
    optedInCustomers: 'సమ్మతించిన కస్టమర్లు',
    noOptedInCustomers: 'ఇంకా ఎవరూ రిమైండర్లకు సమ్మతించలేదు.',
    settings: 'సెట్టింగ్స్',
    appearance: 'థీమ్',
    darkMode: 'డార్క్',
    lightMode: 'లైట్ (ఎండలో)',
    language: 'భాష',
    shopName: 'దుకాణం పేరు',
    voiceBackendUrl: 'వాయిస్ WebSocket URL',
    voiceBackendHelp: 'ఐచ్ఛికం. 16kHz PCM ఆడియోను పంపుతుంది.',
    demoMode: 'డెమో మోడ్',
    demoModeHelp: '6 నమూనా కస్టమర్లతో ఆఫ్‌లైన్ వాయిస్ పరీక్ష.',
    deleteAllData: 'మొత్తం డేటా తొలగించు',
    deleteAllConfirmTitle: 'మొత్తం డేటా తొలగించాలా?',
    deleteAllConfirmBody: 'ఈ పరికరంలోని అన్ని కస్టమర్లు మరియు లెక్కలు తొలగించబడతాయి.',
    copyMessage: 'సందేశం కాపీ',
    copied: 'కాపీ అయింది',
    openSms: 'SMS',
    openWhatsApp: 'WhatsApp',
    back: 'వెనక్కి',
    noCustomersFound: 'కస్టమర్లు దొరకలేదు.',
    transactionHistory: 'లావాదేవీల చరిత్ర',
    politeReminderTemplate: (customerName, shopName, amountText) =>
      `నమస్కారం ${customerName} గారు, ${shopName} నుండి మీ ₹${amountText} బాకీ గురించి మర్యాదపూర్వక సమాచారం. వీలైనప్పుడు చెల్లించండి. ధన్యవాదాలు!`,
    todaySummaryAnswer: (received, credit, outstanding) =>
      `ఈరోజు ₹${received} వచ్చింది మరియు ₹${credit} అప్పు ఇచ్చాము. మొత్తం బాకీ ₹${outstanding}.`,
    entrySavedSpeech: (customerName, amountText, direction) =>
      direction === 'credit'
        ? `${customerName} ఖాతాలో ${amountText} రూపాయలు అప్పు నమోదైంది.`
        : `${customerName} ఖాతాలో ${amountText} రూపాయలు జమ నమోదైంది.`,
    customerBalanceAnswer: (customerName, amountText, settled, advance) =>
      settled
        ? `${customerName} ఖాతా సరిపోయింది.`
        : advance
        ? `${customerName} వద్ద ${amountText} రూపాయలు అడ్వాన్స్ ఉంది.`
        : `${customerName} వద్ద ${amountText} రూపాయలు బాకీ ఉంది.`,
  },
  mr: {
    namaste: 'नमस्कार',
    aiVoiceAssistant: 'AI व्हॉइस असिस्टंट',
    aiDisclosureSpeech: 'नमस्कार! मी तुमच्या दुकानाच्या खात्याचा AI असिस्टंट आहे. आज काय लिहायचे?',
    homePrompt: 'आज काय लिहायचे?',
    talkToKhata: 'खात्याशी बोला',
    talkSubtitle: 'बोलून हिशोब लिहा',
    ledger: 'खातेवही',
    reminders: 'स्मरणपत्रे',
    todayUdhaar: 'आजची उधारी',
    todayPayments: 'आजची जमा',
    totalOutstanding: 'एकूण बाकी',
    recentEntries: 'अलीकडील नोंदी',
    seeAll: 'सर्व पहा',
    noEntriesYet: 'अजून नोंदी नाहीत.',
    creditGiven: 'उधार दिले',
    paymentReceived: 'पैसे मिळाले',
    today: 'आज',
    yesterday: 'काल',
    edit: 'बदला',
    undo: 'मागे घ्या',
    delete: 'काढा',
    confirm: 'खात्री करा',
    cancel: 'रद्द करा',
    save: 'जतन करा',
    khataAssistant: 'खाते असिस्टंट',
    online: 'ऑनलाइन',
    offline: 'लोकल',
    demoActive: 'डेमो सुरू',
    tapOrHoldMic: 'बोलण्यासाठी माइक दाबा',
    listeningHint: 'ऐकत आहे... बोला',
    thinkingHint: 'समजून घेत आहे...',
    speakingHint: 'बोलत आहे...',
    typeEntryPlaceholder: 'उदा: Ramesh ka 340 udhaar, Sita ne 200 diye',
    send: 'पाठवा',
    whichCustomer: 'कोणते ग्राहक?',
    searchCustomers: 'ग्राहकाचे नाव शोधा...',
    outstandingBalance: 'एकूण बाकी',
    settled: 'हिशोब पूर्ण',
    advance: 'आगाऊ जमा',
    remindersOk: 'स्मरणपत्र संमती',
    remindersOffHint: 'ग्राहकाच्या संमतीनेच चालू करा.',
    sendPoliteReminder: 'विनम्र स्मरणपत्र पाठवा',
    optedInCustomers: 'संमती दिलेले ग्राहक',
    noOptedInCustomers: 'अजून कोणीही संमती दिलेली नाही.',
    settings: 'सेटिंग्ज',
    appearance: 'थीम',
    darkMode: 'डार्क',
    lightMode: 'लाइट (उन्हासाठी)',
    language: 'भाषा',
    shopName: 'दुकानाचे नाव',
    voiceBackendUrl: 'व्हॉइस WebSocket URL',
    voiceBackendHelp: 'ऐच्छिक. 16kHz PCM ऑडिओ पाठवते.',
    demoMode: 'डेमो मोड',
    demoModeHelp: '6 नमुना ग्राहकांसह ऑफलाइन व्हॉइस चाचणी.',
    deleteAllData: 'सर्व डेटा हटवा',
    deleteAllConfirmTitle: 'सर्व खाते डेटा हटवायचा?',
    deleteAllConfirmBody: 'या फोनवरील सर्व ग्राहक आणि नोंदी कायमच्या हटतील.',
    copyMessage: 'संदेश कॉपी करा',
    copied: 'कॉपी केले',
    openSms: 'SMS',
    openWhatsApp: 'WhatsApp',
    back: 'मागे',
    noCustomersFound: 'ग्राहक सापडला नाही.',
    transactionHistory: 'व्यवहाराचा इतिहास',
    politeReminderTemplate: (customerName, shopName, amountText) =>
      `नमस्कार ${customerName} जी, ${shopName} कडून आपल्या ₹${amountText} बाकीबद्दल विनम्र आठवण. सोयीनुसार भरा. धन्यवाद!`,
    todaySummaryAnswer: (received, credit, outstanding) =>
      `आज ₹${received} मिळाले आणि ₹${credit} उधार दिले. एकूण बाकी ₹${outstanding} आहे.`,
    entrySavedSpeech: (customerName, amountText, direction) =>
      direction === 'credit'
        ? `${customerName} यांच्या खात्यात ${amountText} रुपये उधार नोंदवले गेले.`
        : `${customerName} यांच्या खात्यात ${amountText} रुपये जमा नोंदवले गेले.`,
    customerBalanceAnswer: (customerName, amountText, settled, advance) =>
      settled
        ? `${customerName} यांचा हिशोब पूर्ण आहे.`
        : advance
        ? `${customerName} यांचे ${amountText} रुपये आगाऊ जमा आहेत.`
        : `${customerName} यांचे ${amountText} रुपये बाकी आहेत.`,
  },
  bn: {
    namaste: 'নমস্কার',
    aiVoiceAssistant: 'AI ভয়েস অ্যাসিস্ট্যান্ট',
    aiDisclosureSpeech: 'নমস্কার! আমি আপনার দোকানের খাতার AI অ্যাসিস্ট্যান্ট। আজ কী লিখতে হবে?',
    homePrompt: 'আজ কী লিখতে হবে?',
    talkToKhata: 'খাতার সাথে কথা বলুন',
    talkSubtitle: 'বলে হিসাব লিখুন',
    ledger: 'খাতা বই',
    reminders: 'রিমাইন্ডার',
    todayUdhaar: 'আজকের বাকি',
    todayPayments: 'আজকের জমা',
    totalOutstanding: 'মোট পাওনা',
    recentEntries: 'সাম্প্রতিক এন্ট্রি',
    seeAll: 'সব দেখুন',
    noEntriesYet: 'এখনো কোনো এন্ট্রি নেই।',
    creditGiven: 'বাকি দেওয়া হয়েছে',
    paymentReceived: 'টাকা পাওয়া গেছে',
    today: 'আজ',
    yesterday: 'গতকাল',
    edit: 'বদলান',
    undo: 'ফেরত নিন',
    delete: 'মুছুন',
    confirm: 'নিশ্চিত করুন',
    cancel: 'বাতিল',
    save: 'সেভ করুন',
    khataAssistant: 'খাতা অ্যাসিস্ট্যান্ট',
    online: 'অনলাইন',
    offline: 'লোকাল',
    demoActive: 'ডেমো চালু',
    tapOrHoldMic: 'বলতে মাইক চাপুন বা ধরে রাখুন',
    listeningHint: 'শুনছি... বলুন',
    thinkingHint: 'বুঝছি...',
    speakingHint: 'বলছি...',
    typeEntryPlaceholder: 'যেমন: Ramesh ka 340 udhaar, Sita ne 200 diye',
    send: 'পাঠান',
    whichCustomer: 'কোন ক্রেতা?',
    searchCustomers: 'ক্রেতার নাম খুঁজুন...',
    outstandingBalance: 'মোট পাওনা',
    settled: 'হিসাব শোধ',
    advance: 'অগ্রিম জমা',
    remindersOk: 'রিমাইন্ডার সম্মতি',
    remindersOffHint: 'ক্রেতার সম্মতি থাকলেই চালু করুন।',
    sendPoliteReminder: 'ভদ্র রিমাইন্ডার পাঠান',
    optedInCustomers: 'সম্মতি দেওয়া ক্রেতা',
    noOptedInCustomers: 'এখনো কোনো ক্রেতা রিমাইন্ডারে সম্মতি দেননি।',
    settings: 'সেটিংস',
    appearance: 'থিম',
    darkMode: 'ডার্ক',
    lightMode: 'লাইট (রোদের জন্য)',
    language: 'ভাষা',
    shopName: 'দোকানের নাম',
    voiceBackendUrl: 'ভয়েস WebSocket URL',
    voiceBackendHelp: 'ঐচ্ছিক। 16kHz PCM অডিও পাঠায়।',
    demoMode: 'ডেমো মোড',
    demoModeHelp: '৬ জন নমুনা ক্রেতাসহ অফলাইন ভয়েস পরীক্ষা।',
    deleteAllData: 'সব ডেটা মুছুন',
    deleteAllConfirmTitle: 'সব খাতার ডেটা মুছবেন?',
    deleteAllConfirmBody: 'এই ফোনে থাকা সব ক্রেতা ও হিসাব চিরতরে মুছে যাবে।',
    copyMessage: 'মেসেজ কপি',
    copied: 'কপি হয়েছে',
    openSms: 'SMS',
    openWhatsApp: 'WhatsApp',
    back: 'পেছনে',
    noCustomersFound: 'কোনো ক্রেতা পাওয়া যায়নি।',
    transactionHistory: 'লেনদেনের তালিকা',
    politeReminderTemplate: (customerName, shopName, amountText) =>
      `নমস্কার ${customerName} জি, ${shopName} থেকে আপনার ₹${amountText} বকেয়ার বিনম্র স্মরণ। সুবিধামতো পরিশোধ করবেন। ধন্যবাদ!`,
    todaySummaryAnswer: (received, credit, outstanding) =>
      `আজ ₹${received} জমা হয়েছে এবং ₹${credit} বাকি দেওয়া হয়েছে। মোট পাওনা ₹${outstanding}।`,
    entrySavedSpeech: (customerName, amountText, direction) =>
      direction === 'credit'
        ? `${customerName}-এর ${amountText} টাকা বাকি যোগ হয়েছে।`
        : `${customerName}-এর ${amountText} টাকা জমা নথিভুক্ত হয়েছে।`,
    customerBalanceAnswer: (customerName, amountText, settled, advance) =>
      settled
        ? `${customerName}-এর হিসাব শোধ আছে।`
        : advance
        ? `${customerName}-এর ${amountText} টাকা অগ্রিম জমা আছে।`
        : `${customerName}-এর ${amountText} টাকা বাকি আছে।`,
  },
};

export function getSpeechLang(code: LanguageCode): string {
  return LANGUAGES.find((l) => l.code === code)?.speechLang ?? 'en-IN';
}
