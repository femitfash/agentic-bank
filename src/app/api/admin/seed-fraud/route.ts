import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";
import { pseudonymizeId } from "@/shared/lib/fraud-anonymize";

const TARGET_EMAIL = "fashoks33@gmail.com";
const CHECKING_START = 85000;
const SAVINGS_START = 32000;

// Date range: 2 months back from now (dynamic, not static)
function getDateRange(): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 2);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function randomBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function setTime(date: Date, h: number, m: number): Date {
  const d = new Date(date);
  d.setUTCHours(h, m, randomInt(0, 59), 0);
  return d;
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function genId(prefix: string, offset: number): string {
  return `${prefix}-${(Date.now() + offset).toString(36).toUpperCase()}`;
}
function genAccountNumber(): string {
  return Date.now().toString().slice(-8) + Math.floor(Math.random() * 100).toString().padStart(2, "0");
}
function genReference(): string {
  return `REF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

interface RawTxn {
  type: "deposit" | "withdrawal" | "transfer_out";
  amount: number;
  description: string;
  created_at: Date;
  target_account: "checking" | "savings";
  counterparty_account?: "checking" | "savings";
  _is_fraud: boolean;
  _fraud_note?: string;
}

// ── Transaction Metadata (PCI-DSS compliant) ──

interface TxnMetadata {
  ip_address: string;
  device_id: string;
  device_type: string;
  user_agent: string;
  channel: string;
  location: { city: string; region: string; country: string; lat: number; lng: number };
  country: string;
  mcc: string;
  mcc_description: string;
  auth_method: string;
  is_international: boolean;
  is_recurring: boolean;
  risk_signals: { vpn_detected: boolean; tor_detected: boolean; new_device: boolean; unusual_location: boolean; velocity_flag: boolean };
  session_id: string;
  terminal_id: string | null;
}

const HOME_IP_PREFIX = "73.192";
const HOME_LOCATION = { city: "New York", region: "NY", country: "US", lat: 40.7128, lng: -74.006 };
const NORMAL_DEVICE_ID = "d8f4a2b1c9e7";
const NORMAL_USER_AGENTS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AgenticBank/3.2.1",
  "Mozilla/5.0 (Linux; Android 14) AgenticBank/3.2.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36",
];

const MCC_MAP: Record<string, { mcc: string; desc: string }> = {
  grocery: { mcc: "5411", desc: "Grocery Stores" },
  restaurant: { mcc: "5812", desc: "Eating Places / Restaurants" },
  gas: { mcc: "5541", desc: "Service Stations" },
  atm: { mcc: "6011", desc: "ATM Cash Disbursement" },
  subscription: { mcc: "5968", desc: "Subscription Services" },
  utility: { mcc: "4900", desc: "Utilities" },
  rent: { mcc: "6513", desc: "Real Estate / Rent" },
  payroll: { mcc: "0000", desc: "Direct Deposit / Payroll" },
  transfer: { mcc: "4829", desc: "Wire / Money Transfer" },
  electronics: { mcc: "5732", desc: "Electronics Stores" },
  gift_card: { mcc: "5994", desc: "Newsstands / Gift Cards" },
  luxury: { mcc: "5944", desc: "Jewelry / Luxury Goods" },
  crypto: { mcc: "6051", desc: "Cryptocurrency / Quasi-Cash" },
  generic: { mcc: "5999", desc: "Miscellaneous Retail" },
};

function genSessionId(): string {
  return `sess_${Math.random().toString(36).slice(2, 14)}`;
}

function inferMccCategory(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("payroll") || d.includes("direct deposit")) return "payroll";
  if (d.includes("rent")) return "rent";
  if (d.includes("utility") || d.includes("coned") || d.includes("verizon") || d.includes("spectrum")) return "utility";
  if (d.includes("recurring") || d.includes("netflix") || d.includes("spotify") || d.includes("icloud") || d.includes("amazon prime")) return "subscription";
  if (d.includes("whole foods") || d.includes("trader joe") || d.includes("kroger") || d.includes("safeway") || d.includes("aldi") || d.includes("costco")) return "grocery";
  if (d.includes("chipotle") || d.includes("starbucks") || d.includes("panera") || d.includes("chick-fil") || d.includes("olive garden") || d.includes("domino")) return "restaurant";
  if (d.includes("shell") || d.includes("bp ") || d.includes("exxon") || d.includes("chevron") || d.includes("mobil")) return "gas";
  if (d.includes("atm")) return "atm";
  if (d.includes("wire") || d.includes("transfer")) return "transfer";
  if (d.includes("gift card") || d.includes("prepaid") || d.includes("digital wallet")) return "gift_card";
  if (d.includes("electro") || d.includes("electronics")) return "electronics";
  if (d.includes("luxury")) return "luxury";
  if (d.includes("crypto")) return "crypto";
  return "generic";
}

function generateMetadata(raw: RawTxn): TxnMetadata {
  const mccCat = inferMccCategory(raw.description);
  const mcc = MCC_MAP[mccCat] || MCC_MAP.generic;
  const hour = raw.created_at.getUTCHours();

  if (!raw._is_fraud) {
    // ── Normal transaction metadata ──
    const isAtm = mccCat === "atm";
    const isPOS = ["grocery", "restaurant", "gas"].includes(mccCat);
    const isOnline = ["subscription", "utility", "rent"].includes(mccCat);

    const channel = isAtm ? "atm" : isPOS ? "pos" : raw.type === "deposit" ? "ach" : raw.type === "transfer_out" ? "online_banking" : isOnline ? "online_banking" : "mobile_app";
    const deviceType = isAtm ? "atm" : isPOS ? "pos_terminal" : randomItem(["mobile", "desktop"]);
    const authMethod = isAtm ? "pin" : isPOS ? (Math.random() > 0.3 ? "chip" : "contactless") : Math.random() > 0.5 ? "biometric" : "password";

    return {
      ip_address: `${HOME_IP_PREFIX}.${randomInt(1, 254)}.${randomInt(1, 254)}`,
      device_id: NORMAL_DEVICE_ID,
      device_type: deviceType,
      user_agent: isAtm || isPOS ? `POS-Terminal/${randomInt(1, 50)}` : randomItem(NORMAL_USER_AGENTS),
      channel,
      location: { ...HOME_LOCATION, lat: HOME_LOCATION.lat + (Math.random() - 0.5) * 0.05, lng: HOME_LOCATION.lng + (Math.random() - 0.5) * 0.05 },
      country: "US",
      mcc: mcc.mcc,
      mcc_description: mcc.desc,
      auth_method: authMethod,
      is_international: false,
      is_recurring: ["subscription", "rent", "utility"].includes(mccCat),
      risk_signals: { vpn_detected: false, tor_detected: false, new_device: false, unusual_location: false, velocity_flag: false },
      session_id: genSessionId(),
      terminal_id: isAtm ? `ATM-${randomInt(1000, 9999)}` : isPOS ? `POS-${randomInt(10000, 99999)}` : null,
    };
  }

  // ── Fraudulent transaction metadata ──
  const desc = raw.description.toLowerCase();
  const isForeignLoc = desc.includes("lagos") || desc.includes("bangkok") || desc.includes("dubai") || desc.includes("moscow") || desc.includes("shenzhen") || desc.includes("cayman");
  const isOffshoreWire = desc.includes("offshore") || desc.includes("wire transfer");
  const isCrypto = desc.includes("crypto");
  const isVelocity = desc.includes("gift card") || desc.includes("prepaid") || desc.includes("digital wallet");
  const isRapidAtm = desc.includes("unknown atm");
  const isOddHour = hour >= 0 && hour < 6;

  // Pick a suspicious foreign location or randomize
  const FRAUD_LOCATIONS: Record<string, { city: string; region: string; country: string; lat: number; lng: number }> = {
    lagos: { city: "Lagos", region: "Lagos", country: "NG", lat: 6.5244, lng: 3.3792 },
    bangkok: { city: "Bangkok", region: "Bangkok", country: "TH", lat: 13.7563, lng: 100.5018 },
    dubai: { city: "Dubai", region: "Dubai", country: "AE", lat: 25.2048, lng: 55.2708 },
    moscow: { city: "Moscow", region: "Moscow", country: "RU", lat: 55.7558, lng: 37.6173 },
    shenzhen: { city: "Shenzhen", region: "Guangdong", country: "CN", lat: 22.5431, lng: 114.0579 },
    cayman: { city: "George Town", region: "Grand Cayman", country: "KY", lat: 19.2869, lng: -81.3674 },
  };
  const locKey = Object.keys(FRAUD_LOCATIONS).find(k => desc.includes(k));
  const location = locKey ? FRAUD_LOCATIONS[locKey] : isForeignLoc ? randomItem(Object.values(FRAUD_LOCATIONS)) : HOME_LOCATION;
  const isIntl = location.country !== "US";

  // Fraud comes from new/unusual devices and IPs
  const fraudIpPrefixes = ["185.220", "91.234", "103.47", "196.52", "45.155"];
  const fraudDeviceIds = ["unknown_a3f1", "unknown_b7c2", "unknown_d9e4", "spoofed_00ff"];

  return {
    ip_address: isIntl || isOddHour
      ? `${randomItem(fraudIpPrefixes)}.${randomInt(1, 254)}.${randomInt(1, 254)}`
      : `${HOME_IP_PREFIX}.${randomInt(1, 254)}.${randomInt(1, 254)}`,
    device_id: isRapidAtm ? `cloned_${randomInt(1000, 9999)}` : randomItem(fraudDeviceIds),
    device_type: isRapidAtm ? "atm" : isOffshoreWire ? "desktop" : isCrypto ? "desktop" : isVelocity ? "pos_terminal" : "mobile",
    user_agent: isRapidAtm ? `ATM-Clone/1.0` : isIntl ? `Mozilla/5.0 (Linux; Android 11) UnknownBrowser/1.0` : randomItem(NORMAL_USER_AGENTS),
    channel: isRapidAtm ? "atm" : isOffshoreWire ? "wire" : isCrypto ? "online_banking" : isVelocity ? "pos" : "online_banking",
    location,
    country: location.country,
    mcc: mcc.mcc,
    mcc_description: mcc.desc,
    auth_method: isRapidAtm ? "pin" : isOffshoreWire ? "password" : isVelocity ? "contactless" : "password",
    is_international: isIntl,
    is_recurring: false,
    risk_signals: {
      vpn_detected: isCrypto || (isIntl && !isRapidAtm),
      tor_detected: isCrypto && Math.random() > 0.5,
      new_device: true,
      unusual_location: isIntl || isOddHour,
      velocity_flag: isVelocity || isRapidAtm,
    },
    session_id: genSessionId(),
    terminal_id: isRapidAtm ? `ATM-UNKNOWN-${randomInt(8000, 9999)}` : isVelocity ? `POS-${randomInt(10000, 99999)}` : null,
  };
}

function generateNormalTransactions(): RawTxn[] {
  const { start: START_DATE, end: END_DATE } = getDateRange();
  const txns: RawTxn[] = [];
  const groceries = ["Whole Foods", "Trader Joes", "Kroger", "Safeway", "Aldi", "Costco", "Publix", "H-E-B", "Wegmans"];
  const restaurants = ["Chipotle", "Starbucks", "Panera Bread", "Chick-fil-A", "Olive Garden", "Dominos Pizza", "Subway", "Panda Express", "Five Guys"];
  const gas = ["Shell", "BP", "Exxon", "Chevron", "Mobil", "Sunoco", "Valero"];
  const atms = ["Chase ATM #4521", "BOA ATM #1187", "Wells Fargo ATM #3392", "Citi ATM #2044", "TD Bank ATM #6178"];
  const utilities = [
    { name: "ConEd Electric", range: [80, 160] as [number, number] },
    { name: "Verizon Wireless", range: [95, 115] as [number, number] },
    { name: "Spectrum Internet", range: [69.99, 79.99] as [number, number] },
    { name: "National Grid Gas", range: [45, 120] as [number, number] },
  ];
  const subs = [
    { name: "Netflix", amount: 15.99 },
    { name: "Spotify Premium", amount: 10.99 },
    { name: "Apple iCloud+", amount: 2.99 },
    { name: "Amazon Prime", amount: 14.99 },
    { name: "YouTube Premium", amount: 13.99 },
    { name: "Disney+", amount: 7.99 },
  ];

  let cur = new Date(START_DATE);
  while (cur <= END_DATE) {
    const dom = cur.getUTCDate();
    const dow = cur.getUTCDay();

    // Payroll — slight date jitter (1st/15th +/- 1 day)
    if (dom === 1 || dom === 15 || (dom === 2 && Math.random() > 0.7) || (dom === 14 && Math.random() > 0.7)) {
      if (dom <= 2 || dom >= 14) {
        txns.push({ type: "deposit", amount: randomBetween(2800, 3400), description: `Direct Deposit - Payroll - ${randomItem(["TechCorp Inc", "TechCorp Inc", "Acme Software"])}`, created_at: setTime(cur, randomInt(7, 9), randomInt(0, 59)), target_account: "checking", _is_fraud: false });
      }
    }
    // Rent
    if (dom === 1) {
      txns.push({ type: "withdrawal", amount: randomBetween(1400, 1500), description: "Rent Payment - Oakwood Apartments", created_at: setTime(cur, randomInt(8, 11), randomInt(0, 59)), target_account: "checking", _is_fraud: false });
    }
    // Utilities — random day within window
    if (dom >= 8 && dom <= 14 && Math.random() > 0.5) {
      const u = randomItem(utilities);
      txns.push({ type: "withdrawal", amount: randomBetween(u.range[0], u.range[1]), description: `Utility Payment - ${u.name}`, created_at: setTime(cur, randomInt(9, 17), randomInt(0, 59)), target_account: "checking", _is_fraud: false });
    }
    // Subscriptions — random day between 3rd and 7th
    if (dom >= 3 && dom <= 7 && Math.random() > 0.6) {
      const s = randomItem(subs);
      txns.push({ type: "withdrawal", amount: s.amount, description: `Recurring - ${s.name}`, created_at: setTime(cur, randomInt(0, 6), randomInt(0, 59)), target_account: "checking", _is_fraud: false });
    }
    // Groceries — some days, not all
    if ([2, 4, 6].includes(dow) && Math.random() > 0.25) {
      txns.push({ type: "withdrawal", amount: randomBetween(18, 145), description: `POS Purchase - ${randomItem(groceries)}`, created_at: setTime(cur, randomInt(10, 19), randomInt(0, 59)), target_account: "checking", _is_fraud: false });
    }
    // Restaurants — randomly skip some
    if ([1, 3, 5].includes(dow) && Math.random() > 0.3) {
      txns.push({ type: "withdrawal", amount: randomBetween(8, 65), description: `POS Purchase - ${randomItem(restaurants)}`, created_at: setTime(cur, randomInt(11, 21), randomInt(0, 59)), target_account: "checking", _is_fraud: false });
    }
    // Gas — not every Saturday
    if (dow === 6 && Math.random() > 0.35) {
      txns.push({ type: "withdrawal", amount: randomBetween(30, 75), description: `POS Purchase - ${randomItem(gas)}`, created_at: setTime(cur, randomInt(8, 16), randomInt(0, 59)), target_account: "checking", _is_fraud: false });
    }
    // ATM — random days
    if (dow === 3 && Math.random() > 0.3) {
      txns.push({ type: "withdrawal", amount: Math.round(randomBetween(2, 12)) * 20, description: `ATM Withdrawal - ${randomItem(atms)}`, created_at: setTime(cur, randomInt(9, 20), randomInt(0, 59)), target_account: "checking", _is_fraud: false });
    }
    if (dow === 5 && Math.random() > 0.6) {
      txns.push({ type: "withdrawal", amount: Math.round(randomBetween(2, 8)) * 20, description: `ATM Withdrawal - ${randomItem(atms)}`, created_at: setTime(cur, randomInt(12, 20), randomInt(0, 59)), target_account: "checking", _is_fraud: false });
    }
    // Savings transfer — random day near 20th
    if (dom >= 18 && dom <= 22 && Math.random() > 0.7) {
      txns.push({ type: "transfer_out", amount: randomBetween(150, 600), description: "Monthly Transfer to Savings", created_at: setTime(cur, randomInt(9, 12), randomInt(0, 59)), target_account: "checking", counterparty_account: "savings", _is_fraud: false });
    }
    // Occasional extra purchase — adds unpredictability
    if (Math.random() > 0.85) {
      const extras = ["Target", "Walgreens", "CVS Pharmacy", "Home Depot", "Best Buy", "TJ Maxx", "Nordstrom Rack"];
      txns.push({ type: "withdrawal", amount: randomBetween(15, 250), description: `POS Purchase - ${randomItem(extras)}`, created_at: setTime(cur, randomInt(10, 20), randomInt(0, 59)), target_account: "checking", _is_fraud: false });
    }

    cur = addDays(cur, 1);
  }
  return txns;
}

function generateFraudulentTransactions(): RawTxn[] {
  const { start: START_DATE, end: END_DATE } = getDateRange();
  const txns: RawTxn[] = [];

  // Helper: pick a random date within the range
  const totalDays = Math.floor((END_DATE.getTime() - START_DATE.getTime()) / (1000 * 60 * 60 * 24));
  function randomDate(minDayOffset = 5, maxDayOffset?: number): Date {
    const max = maxDayOffset ?? totalDays - 2;
    return addDays(START_DATE, randomInt(Math.min(minDayOffset, max), max));
  }

  const offshoreEntities = ["Offshore Holdings Ltd - Cayman Islands", "Pacific Ventures - British Virgin Islands", "Global Trust SA - Panama", "Meridian Capital - Isle of Man"];
  const foreignCities = ["Dubai, UAE", "Moscow, Russia", "Shenzhen, China", "São Paulo, Brazil", "Bucharest, Romania"];
  const geoLocations = [
    { desc: "Electronics Mega Store - Lagos, Nigeria", note: "Geographic anomaly — Lagos, Nigeria" },
    { desc: "Luxury Goods - Bangkok, Thailand", note: "Geographic anomaly — Bangkok, Thailand" },
    { desc: "Electronics Store - Johannesburg, South Africa", note: "Geographic anomaly — Johannesburg, South Africa" },
    { desc: "Market Purchase - Nairobi, Kenya", note: "Geographic anomaly — Nairobi, Kenya" },
  ];
  const cryptoExchanges = ["CryptoMix Exchange", "BitSwap Pro", "DarkPool Finance", "Anon Coin Exchange"];
  const shellCompanies = ["Anonymous Holding LLC", "Phantom Corp Ltd", "NexGen Capital Offshore", "Apex Fiduciary Services"];
  const giftCardMerchants = ["Gift Card Kiosk", "Online Prepaid", "Digital Wallet Load", "Prepaid Card Store", "Gift Card Exchange", "Virtual Card Service", "E-Gift Depot", "Reload Station", "Crypto Gift Card", "Prepaid Mobile Top-Up"];
  const unknownAtmPrefix = randomInt(7000, 9999);
  const branchNum = randomInt(1000, 9999);

  // Large unusual withdrawals — 2-4 instances at random dates
  const numLargeWithdrawals = randomInt(2, 4);
  for (let i = 0; i < numLargeWithdrawals; i++) {
    const d = randomDate(7 + i * 10, Math.min(7 + (i + 1) * 12, totalDays - 2));
    const amt = randomBetween(4000, 12000);
    txns.push({ type: "withdrawal", amount: amt, description: `Counter Withdrawal - Branch #${branchNum}`, created_at: setTime(d, randomInt(9, 16), randomInt(0, 59)), target_account: "checking", _is_fraud: true, _fraud_note: `Large unusual withdrawal — $${Math.round(amt).toLocaleString()} vs normal max ~$200` });
  }

  // Rapid successive ATM withdrawals — random cluster size (3-6)
  const atmClusterSize = randomInt(3, 6);
  const atmDate = randomDate(14, totalDays - 5);
  const atmStartHour = randomInt(21, 23);
  const atmStartMin = randomInt(0, 30);
  const atmAmount = randomItem([200, 300, 400, 500]);
  for (let i = 0; i < atmClusterSize; i++) {
    txns.push({ type: "withdrawal", amount: atmAmount, description: `ATM Withdrawal - Unknown ATM #${unknownAtmPrefix + i}`, created_at: setTime(atmDate, atmStartHour, atmStartMin + i * randomInt(4, 8)), target_account: "checking", _is_fraud: true, _fraud_note: `Rapid ATM cluster — ${atmClusterSize}x $${atmAmount} within ${atmClusterSize * 6}min at unknown ATMs (${i + 1}/${atmClusterSize})` });
  }

  // Round-number wire transfers — 2-4 at random dates with random amounts
  const numWires = randomInt(2, 4);
  const wireAmounts = [5000, 7500, 10000, 12000, 15000, 20000, 25000];
  for (let i = 0; i < numWires; i++) {
    const d = randomDate(5 + i * 12, Math.min(5 + (i + 1) * 15, totalDays - 2));
    const entity = randomItem(offshoreEntities);
    const amt = randomItem(wireAmounts);
    txns.push({ type: "withdrawal", amount: amt, description: `Wire Transfer - ${entity}`, created_at: setTime(d, randomInt(13, 18), randomInt(0, 59)), target_account: "checking", _is_fraud: true, _fraud_note: `Round-number offshore wire — $${amt.toLocaleString()} to ${entity.split(" - ")[1]}` });
  }

  // Odd-hour foreign purchases — 3-5 at random dates
  const numOddHour = randomInt(3, 5);
  for (let i = 0; i < numOddHour; i++) {
    const d = randomDate(3 + i * 8);
    const city = randomItem(foreignCities);
    txns.push({ type: "withdrawal", amount: randomBetween(400, 3000), description: `Online Purchase - ElectroMart - ${city}`, created_at: setTime(d, randomInt(1, 4), randomInt(0, 45)), target_account: "checking", _is_fraud: true, _fraud_note: `Odd-hour foreign purchase — ${randomInt(1, 4)} AM, ${city}` });
  }

  // Geographic anomalies — pick 1-3 random locations
  const numGeo = randomInt(1, 3);
  const geoSample = [...geoLocations].sort(() => Math.random() - 0.5).slice(0, numGeo);
  for (const geo of geoSample) {
    const d = randomDate(10);
    txns.push({ type: "withdrawal", amount: randomBetween(600, 4500), description: `POS Purchase - ${geo.desc}`, created_at: setTime(d, randomInt(10, 18), randomInt(0, 59)), target_account: "checking", _is_fraud: true, _fraud_note: `${geo.note} (no prior international activity)` });
  }

  // Suspicious counterparties — 1-3
  const numSuspicious = randomInt(1, 3);
  for (let i = 0; i < numSuspicious; i++) {
    const d = randomDate(15 + i * 10);
    const isCrypto = Math.random() > 0.5;
    const name = isCrypto ? randomItem(cryptoExchanges) : randomItem(shellCompanies);
    const prefix = isCrypto ? "Wire Transfer" : "Payment";
    const note = isCrypto ? `Suspicious counterparty — crypto exchange (${name}), late night` : `Suspicious counterparty — shell company (${name}), late night`;
    txns.push({ type: "withdrawal", amount: randomBetween(1500, 9000), description: `${prefix} - ${name}`, created_at: setTime(d, randomInt(20, 23), randomInt(0, 59)), target_account: "checking", _is_fraud: true, _fraud_note: note });
  }

  // Velocity spike — random cluster size (5-10) of gift card purchases
  const giftCardCount = randomInt(5, 10);
  const giftCardDate = randomDate(totalDays - 10, totalDays - 3);
  const giftCardStartHour = randomInt(12, 16);
  const shuffledMerchants = [...giftCardMerchants].sort(() => Math.random() - 0.5);
  for (let i = 0; i < giftCardCount; i++) {
    const merchant = shuffledMerchants[i % shuffledMerchants.length];
    const suffix = giftCardCount > giftCardMerchants.length ? ` #${randomInt(1, 9)}` : "";
    txns.push({ type: "withdrawal", amount: randomBetween(10, 45), description: `POS Purchase - ${merchant}${suffix}`, created_at: setTime(giftCardDate, giftCardStartHour, i * randomInt(10, 18)), target_account: "checking", _is_fraud: true, _fraud_note: `Velocity spike — ${giftCardCount} gift card purchases in ${Math.ceil(giftCardCount * 15 / 60)}hrs (${i + 1}/${giftCardCount})` });
  }

  return txns;
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const orgId = await getOrganizationId(admin, user);
  if (!orgId) return Response.json({ error: "No organization found" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";
  const mode = searchParams.get("mode") || "mixed"; // "mixed" | "append" | "clean_only"
  const targetCustomerId = searchParams.get("customer_id"); // existing customer UUID
  const targetAccountId = searchParams.get("account_id"); // existing account UUID (checking)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let customer: any = null;

  if (targetCustomerId) {
    // Use specified existing customer
    const { data } = await (admin as any)
      .from("customers")
      .select("id, customer_id")
      .eq("id", targetCustomerId)
      .eq("organization_id", orgId)
      .single();
    if (!data) return Response.json({ error: "Customer not found" }, { status: 404 });
    customer = data;
  } else {
    // Find or create default customer
    const { data: existing } = await (admin as any)
      .from("customers")
      .select("id, customer_id")
      .eq("organization_id", orgId)
      .eq("email", TARGET_EMAIL)
      .single();

    if (existing) {
      customer = existing;
    } else {
      const { data, error } = await (admin as any)
        .from("customers")
        .insert({
          organization_id: orgId,
          customer_id: genId("CUST", 0),
          first_name: "Fashola",
          last_name: "Komolafe",
          email: TARGET_EMAIL,
          phone: "+1-555-0142",
          address: { street: "742 Evergreen Terrace", city: "New York", state: "NY", zip: "10001" },
          kyc_status: "verified",
          created_by: null,
        })
        .select("id, customer_id")
        .single();
      if (error) return Response.json({ error: "Failed to create customer", detail: error.message }, { status: 500 });
      customer = data;
    }
  }

  // Find or create accounts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingAccounts } = await (admin as any)
    .from("accounts")
    .select("id, account_id, account_type, balance")
    .eq("organization_id", orgId)
    .eq("customer_id", customer.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let checking: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let savings: any = null;

  if (targetAccountId) {
    // Use specified account as the primary (checking) target
    checking = existingAccounts?.find((a: any) => a.id === targetAccountId);
    if (!checking) return Response.json({ error: "Account not found for this customer" }, { status: 404 });
    // Find another account for transfers, or skip transfers
    savings = existingAccounts?.find((a: any) => a.id !== targetAccountId) || null;
  } else {
    checking = existingAccounts?.find((a: any) => a.account_type === "checking");
    savings = existingAccounts?.find((a: any) => a.account_type === "savings");
  }

  if (!checking) {
    const { data, error } = await (admin as any)
      .from("accounts")
      .insert({ organization_id: orgId, account_id: genId("ACCT", 0), customer_id: customer.id, account_number: genAccountNumber(), account_type: "checking", balance: CHECKING_START, currency: "USD", status: "active", created_by: null })
      .select("id, account_id")
      .single();
    if (error) return Response.json({ error: "Failed to create checking account", detail: error.message }, { status: 500 });
    checking = data;
  }

  if (!savings) {
    const { data, error } = await (admin as any)
      .from("accounts")
      .insert({ organization_id: orgId, account_id: genId("ACCT", 1), customer_id: customer.id, account_number: genAccountNumber(), account_type: "savings", balance: SAVINGS_START, currency: "USD", status: "active", created_by: null })
      .select("id, account_id")
      .single();
    if (error) return Response.json({ error: "Failed to create savings account", detail: error.message }, { status: 500 });
    savings = data;
  }

  // Idempotency check / cleanup
  const accountIds = savings ? [checking.id, savings.id] : [checking.id];
  const { count } = await (admin as any)
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .in("account_id", accountIds);

  const isAppend = mode === "append" || mode === "clean_only";

  if (count && count > 0 && !isAppend) {
    if (!force) {
      return Response.json({
        success: false,
        message: `${count} transactions already exist. Use "Force Regenerate" to delete and re-seed, or "Add More" to append.`,
        customer_id: customer.customer_id,
        anon_user_id: pseudonymizeId(customer.id),
        checking_account_id: checking.id,
        savings_account_id: savings?.id || null,
      });
    }
    // Force mode: delete existing transactions, scan results, and reset balances
    await (admin as any).from("transactions").delete().in("account_id", accountIds);
    await (admin as any).from("accounts").update({ balance: CHECKING_START }).eq("id", checking.id);
    if (savings) await (admin as any).from("accounts").update({ balance: SAVINGS_START }).eq("id", savings.id);

    // Clean up old scanner results for this org
    const { data: oldBatches } = await (admin as any)
      .from("fraud_scan_batches")
      .select("batch_id")
      .eq("organization_id", orgId);
    if (oldBatches && oldBatches.length > 0) {
      const oldBatchIds = oldBatches.map((b: any) => b.batch_id);
      await (admin as any).from("fraud_scan_results").delete().in("batch_id", oldBatchIds);
      await (admin as any).from("fraud_scan_batches").delete().eq("organization_id", orgId);
    }
  }

  // For append, read current balance from DB; for fresh seed, use defaults
  let checkingBalance: number;
  let savingsBalance: number;
  if (isAppend && count && count > 0) {
    const { data: freshChecking } = await (admin as any).from("accounts").select("balance").eq("id", checking.id).single();
    checkingBalance = Number(freshChecking?.balance || CHECKING_START);
    if (savings) {
      const { data: freshSavings } = await (admin as any).from("accounts").select("balance").eq("id", savings.id).single();
      savingsBalance = Number(freshSavings?.balance || SAVINGS_START);
    } else {
      savingsBalance = 0;
    }
  } else {
    checkingBalance = CHECKING_START;
    savingsBalance = savings ? SAVINGS_START : 0;
  }

  // Generate transactions based on mode
  const normalTxns = generateNormalTransactions()
    .filter(t => savings || t.type !== "transfer_out")
    .map(t => ({ ...t, _is_fraud: false as const }));

  let allRaw: (RawTxn & { _is_fraud: boolean })[];
  if (mode === "clean_only") {
    // Only normal transactions — no fraud injected
    allRaw = normalTxns;
  } else {
    const fraudTxns = generateFraudulentTransactions().map(t => ({ ...t, _is_fraud: true as const }));
    allRaw = [...normalTxns, ...fraudTxns];
  }
  allRaw.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

  const balances: Record<string, number> = { checking: checkingBalance, savings: savingsBalance };
  const acctMap: Record<string, string> = { checking: checking.id };
  if (savings) acctMap.savings = savings.id;

  let idOffset = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records: any[] = [];
  const fraudTxnIds: string[] = [];
  const fraudTxnNotes: Record<string, string> = {};

  for (const raw of allRaw) {
    const key = raw.target_account;
    const before = balances[key];

    let amount = raw.amount;
    if (raw.type !== "deposit") {
      amount = Math.min(amount, Math.max(before - 5, 0));
      if (amount <= 0) continue;
    }

    const after = raw.type === "deposit" ? before + amount : before - amount;
    balances[key] = Math.round(after * 100) / 100;

    const txnId = genId("TXN", idOffset++);
    if (raw._is_fraud) {
      fraudTxnIds.push(txnId);
      fraudTxnNotes[txnId] = raw._fraud_note || "Fraudulent transaction";
    }

    const ref = genReference();
    const metadata = generateMetadata(raw);
    records.push({
      organization_id: orgId,
      transaction_id: txnId,
      account_id: acctMap[key],
      type: raw.type,
      amount,
      balance_before: Math.round(before * 100) / 100,
      balance_after: Math.round(after * 100) / 100,
      counterparty_account_id: raw.counterparty_account ? acctMap[raw.counterparty_account] : null,
      reference: ref,
      description: raw.description,
      status: "completed",
      created_by: null,
      created_at: raw.created_at.toISOString(),
      metadata,
    });

    // Transfer in for counterparty
    if (raw.type === "transfer_out" && raw.counterparty_account) {
      const cpKey = raw.counterparty_account;
      const cpBefore = balances[cpKey];
      const cpAfter = cpBefore + amount;
      balances[cpKey] = Math.round(cpAfter * 100) / 100;
      records.push({
        organization_id: orgId,
        transaction_id: genId("TXN", idOffset++),
        account_id: acctMap[cpKey],
        type: "transfer_in",
        amount,
        balance_before: Math.round(cpBefore * 100) / 100,
        balance_after: Math.round(cpAfter * 100) / 100,
        counterparty_account_id: acctMap[key],
        reference: ref,
        description: "Transfer from Checking",
        status: "completed",
        created_by: null,
        created_at: raw.created_at.toISOString(),
        metadata,
      });
    }
  }

  // Batch insert
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { error } = await (admin as any).from("transactions").insert(batch);
    if (error) return Response.json({ error: `Batch insert failed at ${i}`, detail: error.message }, { status: 500 });
  }

  // Update final balances
  await (admin as any).from("accounts").update({ balance: Math.round(balances.checking * 100) / 100 }).eq("id", checking.id);
  if (savings) await (admin as any).from("accounts").update({ balance: Math.round(balances.savings * 100) / 100 }).eq("id", savings.id);

  // Persist ground truth to DB for reinforcement learning API
  if (fraudTxnIds.length > 0) {
    // On force mode, clear old ground truth first
    if (force) {
      await (admin as any).from("fraud_ground_truth").delete().eq("organization_id", orgId);
    }
    const gtRows = fraudTxnIds.map(txnId => ({
      organization_id: orgId,
      transaction_id: txnId,
      is_fraud: true,
      note: fraudTxnNotes[txnId] || null,
    }));
    for (let i = 0; i < gtRows.length; i += 50) {
      await (admin as any).from("fraud_ground_truth").upsert(gtRows.slice(i, i + 50), { onConflict: "organization_id,transaction_id" });
    }
  }

  const modeLabel = mode === "clean_only" ? "clean (no fraud)" : mode === "append" ? "appended" : "seeded";
  const fraudLabel = mode === "clean_only" ? "0 fraud" : `${fraudTxnIds.length} fraudulent patterns`;

  return Response.json({
    success: true,
    mode,
    message: `${modeLabel === "appended" ? "Appended" : "Seeded"} ${records.length} transactions (${normalTxns.length} normal + ${fraudLabel})`,
    organization_id: orgId,
    customer_id: customer.customer_id,
    customer_uuid: customer.id,
    anon_user_id: pseudonymizeId(customer.id),
    checking_account_id: checking.id,
    savings_account_id: savings?.id || null,
    checking_balance: balances.checking,
    savings_balance: savings ? balances.savings : null,
    total_transactions: records.length,
    fraud_transaction_ids: fraudTxnIds,
    fraud_transaction_notes: fraudTxnNotes,
    fraud_count: fraudTxnIds.length,
  }, { status: 201 });
}
