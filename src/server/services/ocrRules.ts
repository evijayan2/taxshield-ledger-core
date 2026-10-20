import { GeneralExpenseCategory } from '../../types';

export interface MerchantRule {
  name: string;
  aliases: string[];
  category: GeneralExpenseCategory;
  scheduleCLine: string;
}

export const KNOWN_MERCHANT_RULES: MerchantRule[] = [
  {
    name: 'Amazon Web Services',
    aliases: ['AWS', 'AMAZON WEB SERVICES', 'AWS.AMAZON.COM'],
    category: 'SOFTWARE_TECH',
    scheduleCLine: 'Line 27a',
  },
  {
    name: 'Google Cloud Platform',
    aliases: ['GOOGLE CLOUD', 'GCP', 'GOOGLE WORKSPACE', 'GOOGLE *CLOUD'],
    category: 'SOFTWARE_TECH',
    scheduleCLine: 'Line 27a',
  },
  {
    name: 'GitHub',
    aliases: ['GITHUB', 'GITHUB, INC.'],
    category: 'SOFTWARE_TECH',
    scheduleCLine: 'Line 27a',
  },
  {
    name: 'Slack Technologies',
    aliases: ['SLACK', 'SLACK TECHNOLOGIES'],
    category: 'SOFTWARE_TECH',
    scheduleCLine: 'Line 27a',
  },
  {
    name: 'Staples',
    aliases: ['STAPLES', 'STAPLES STORE', 'STAPLES.COM'],
    category: 'OFFICE_SUPPLIES',
    scheduleCLine: 'Line 18',
  },
  {
    name: 'Office Depot',
    aliases: ['OFFICE DEPOT', 'OFFICEMAX'],
    category: 'OFFICE_SUPPLIES',
    scheduleCLine: 'Line 18',
  },
  {
    name: 'Verizon',
    aliases: ['VERIZON', 'VERIZON WIRELESS'],
    category: 'PHONE_INTERNET',
    scheduleCLine: 'Line 25',
  },
  {
    name: 'AT&T',
    aliases: ['AT&T', 'ATT WIRELESS'],
    category: 'PHONE_INTERNET',
    scheduleCLine: 'Line 25',
  },
  {
    name: 'Comcast Business',
    aliases: ['COMCAST', 'XFINITY', 'COMCAST BUSINESS'],
    category: 'PHONE_INTERNET',
    scheduleCLine: 'Line 25',
  },
  {
    name: 'Meta Platforms',
    aliases: ['META ADS', 'FACEBOOK ADS', 'META PLATFORMS'],
    category: 'MARKETING',
    scheduleCLine: 'Line 8',
  },
  {
    name: 'Google Ads',
    aliases: ['GOOGLE ADS', 'GOOGLE ADWORDS'],
    category: 'MARKETING',
    scheduleCLine: 'Line 8',
  },
  {
    name: 'LegalZoom',
    aliases: ['LEGALZOOM', 'LEGALZOOM.COM'],
    category: 'LEGAL_ACCOUNTING',
    scheduleCLine: 'Line 17',
  },
  {
    name: 'Stripe',
    aliases: ['STRIPE', 'STRIPE PAYMENTS'],
    category: 'BANK_FEES',
    scheduleCLine: 'Line 27a',
  },
  {
    name: 'Mercury Bank',
    aliases: ['MERCURY', 'MERCURY BANK', 'MERCURY TECHNOLOGIES'],
    category: 'BANK_FEES',
    scheduleCLine: 'Line 27a',
  },
  {
    name: 'WeWork',
    aliases: ['WEWORK', 'WE WORK'],
    category: 'RENT_LEASE',
    scheduleCLine: 'Line 20b',
  },
  {
    name: "BJ's Wholesale Club",
    aliases: ["BJ'S", 'BJS', "BJ'S WHOLESALE", 'BJS WHOLESALE', "BJ'S CLUB"],
    category: 'OFFICE_SUPPLIES',
    scheduleCLine: 'Line 18',
  },
  {
    name: 'Costco Wholesale',
    aliases: ['COSTCO', 'COSTCO WHOLESALE'],
    category: 'OFFICE_SUPPLIES',
    scheduleCLine: 'Line 18',
  },
  {
    name: "Sam's Club",
    aliases: ["SAM'S CLUB", 'SAMS CLUB', 'SAMS'],
    category: 'OFFICE_SUPPLIES',
    scheduleCLine: 'Line 18',
  },
  {
    name: 'Walmart',
    aliases: ['WALMART', 'WAL-MART'],
    category: 'OFFICE_SUPPLIES',
    scheduleCLine: 'Line 18',
  },
  {
    name: 'Target',
    aliases: ['TARGET', 'TARGET STORE'],
    category: 'OFFICE_SUPPLIES',
    scheduleCLine: 'Line 18',
  },
  {
    name: 'Home Depot',
    aliases: ['HOME DEPOT', 'THE HOME DEPOT'],
    category: 'OFFICE_SUPPLIES',
    scheduleCLine: 'Line 18',
  },
  {
    name: "Lowe's",
    aliases: ["LOWE'S", 'LOWES'],
    category: 'OFFICE_SUPPLIES',
    scheduleCLine: 'Line 18',
  },
  {
    name: 'Best Buy',
    aliases: ['BEST BUY', 'BESTBUY'],
    category: 'SOFTWARE_TECH',
    scheduleCLine: 'Line 27a',
  },
];

export const SCHEDULE_C_LINE_MAP: Record<GeneralExpenseCategory, { line: string; description: string }> = {
  LEGAL_ACCOUNTING: { line: 'Line 17', description: 'Legal and professional services' },
  SOFTWARE_TECH: { line: 'Line 27a', description: 'Other expenses: Software & cloud subscriptions' },
  OFFICE_SUPPLIES: { line: 'Line 18', description: 'Office expense' },
  PHONE_INTERNET: { line: 'Line 25', description: 'Utilities: Communications & internet' },
  BANK_FEES: { line: 'Line 27a', description: 'Other expenses: Banking and merchant processing fees' },
  MARKETING: { line: 'Line 8', description: 'Advertising' },
  UTILITIES: { line: 'Line 25', description: 'Utilities' },
  RENT_LEASE: { line: 'Line 20b', description: 'Rent or lease: Other business property' },
  OTHER: { line: 'Line 27a', description: 'Other expenses' },
};

export const CATEGORY_KEYWORDS: Record<GeneralExpenseCategory, string[]> = {
  LEGAL_ACCOUNTING: ['attorney', 'legal', 'lawyer', 'cpa', 'accounting', 'incorporation', 'registered agent', 'filing fee'],
  SOFTWARE_TECH: ['software', 'hosting', 'cloud', 'saas', 'subscription', 'domain', 'api', 'server', 'compute', 'database'],
  OFFICE_SUPPLIES: ['paper', 'stationery', 'toner', 'printer', 'desk', 'folder', 'pen', 'supplies', 'stapler'],
  PHONE_INTERNET: ['wireless', 'cellular', 'broadband', 'telecom', 'fiber', 'internet', 'data plan', 'mobile phone'],
  BANK_FEES: ['merchant fee', 'wire fee', 'bank charge', 'service charge', 'transaction fee', 'overdraft'],
  MARKETING: ['advertising', 'ad campaign', 'promo', 'billboard', 'flyer', 'sponsorship', 'lead generation'],
  UTILITIES: ['electric', 'gas', 'water', 'sewer', 'power', 'heating'],
  RENT_LEASE: ['rent', 'lease', 'co-working', 'office space', 'storage unit'],
  OTHER: ['miscellaneous', 'other'],
};
