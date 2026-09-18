// All Commishes selectors in one place for easy maintenance

export const SELECTORS = {
  // Page 1 - Create Auction
  create: {
    fileInput: 'input[type="file"][name="file"]',
    category: 'select[name="category"]',
    subtitle: 'input[name="subtitle"]',
    title: 'input[name="title"]',
    description: 'textarea[name="description"]',
    rating: (value: string) => `input[name="rating"][value="${value}"]`,
    nsfw: 'input[name="nsfw"]',
    preventSniping: 'input[name="security[sniping_disabled]"]',
    createButton: 'button:has-text("Create auction")'
  },

  // Page 2 - Start Auction
  start: {
    promoted: 'input[name="promoted"]',
    durationInputs: 'input[name="duration"]',
    duration: (value: string) => `input[name="duration"][value="${value}"]`,
    form: 'form.regular',
    goButton: 'form.regular button'
  },

  // Page 3 - Ready / Confirm Start
  ready: {
    startingBid: 'input[name="startingbid"]',
    minIncrease: 'input[name="minincrease"]',
    autobuyEnabled: 'input[name="autobuyenabled"]',
    autobuy: 'input[name="autobuy"]',
    startNowButton: 'input[type="submit"][value="Start now!"]'
  },

  // Common
  common: {
    challengeIndicators: [
      'captcha',
      'challenge',
      'verify',
      'cloudflare',
      'recaptcha'
    ]
  }
} as const;

export const URLS = {
  create: 'https://ych.commishes.com/auction/create/',
  startPattern: /\/auction\/start\/\d+\//,
  readyPattern: /\/auction\/ready\/\d+\//,
  base: 'https://ych.commishes.com'
} as const;