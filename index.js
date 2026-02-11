/**
 * Sipal Satsume Bot - Airdrop Automation
 * by Sipal Airdrop
 * 
 * All-in-one script: Login, Check-in, Faucet, Purchase, Review
 * Dashboard UI with realtime status table
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { ethers } = require('ethers');

// ═══════════════════════════════════════════════════════════
// CONFIGURATION (NO EXTERNAL CONFIG FILE)
// ═══════════════════════════════════════════════════════════
const BASE_URL = 'https://api.satsume.com';
const SEPOLIA_RPC = 'https://sepolia.drpc.org';
const NUSD_CONTRACT = '0xcF10A5FB2fF625Dfed3E513221650fE6b04d51Be';

const ENDPOINTS = {
    loginNonce: '/auth/users/login/nonce',
    login: '/auth/users/login',
    userCurrent: '/auth/users/current',
    userInfo: '/points/accounts/user/info',
    checkin: '/points/checkin/perform',
    checkinCalendar: '/points/checkin/calendar/7',
    createOrder: '/product/orders',
    payOrder: '/product/orders/pay/v2',
    activityLog: '/points/activity/createLog',
    submitReview: '/product/product/review',
    productList: '/product/product/page-for-buyer',
    productDetail: '/product/product',
    submitOrder: '/blockchain/scan/submitOrder',
    ordersList: '/product/orders/page/for/user'
};

const RECAPTCHA_SITE_KEY = '6LdNNtMrAAAAAMEQUOEq3UzU-fCmMuhsYtkD36Xc';
const RECAPTCHA_SITE_URL = 'https://satsume.com';

const DELAYS = {
    minDelay: 2000,
    maxDelay: 5000,
    taskDelay: 8000,
    microPause: 500
};

const RETRY = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000
};

const SCHEDULE_RESET_HOUR_UTC = 0;
const LOG_LIMIT = 15;
const TOKENS_FILE = path.join(__dirname, 'tokens.json');
const FINGERPRINT_FILE = path.join(__dirname, 'device_fingerprints.json');

// ═══════════════════════════════════════════════════════════
// PAYMENT CONTRACT ABI (17 params - purchaseWithMarketingAndPermit)
// Server signs verifySignature hash: encodePacked(params + marketingRuleId + shopContract + buyer)
// Then toEthSignedMessageHash + ECDSA. All successful txs use this function.
// ═══════════════════════════════════════════════════════════
const PAYMENT_ABI = [
    'function purchaseWithMarketingAndPermit(uint256 _orderId, uint256 _skuId, uint256 _price, uint256 _inventory, uint256 _inventoryVersion, uint256 _quantity, uint256 _totalAmount, uint256 _shippingFee, uint256 _deadline, uint256 _nonce, uint256 _marketingRuleId, uint8 _os_v, bytes32 _os_r, bytes32 _os_s, uint8 _v, bytes32 _r, bytes32 _s) external'
];

const NUSD_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function nonces(address) view returns (uint256)',
    'function name() view returns (string)',
    'function dailyMint() external',
    'function claimDailyTokens() external',
    'function faucet() external',
    'function mint() external',
    'event DailyMint(address indexed user, uint256 amount, uint256 day)'
];

const NUSD_PERMIT_DOMAIN = {
    name: 'Neuroshards',
    version: '1',
    chainId: 11155111,
    verifyingContract: NUSD_CONTRACT
};

const PERMIT_TYPES = {
    Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ]
};

// Cached NUSD domain name (fetched dynamically from contract)
let _nusdNameCache = null;

// Review templates
const REVIEW_TEMPLATES = [
    'Great product! Fast shipping and excellent quality.',
    'Very satisfied with my purchase. Highly recommended!',
    'Good quality, exactly as described. Will buy again.',
    'Amazing product! Exceeded my expectations.',
    'Perfect! Exactly what I was looking for.',
    'Excellent service and product quality. 5 stars!',
    'Very happy with this purchase. Thank you!',
    'Product arrived quickly and works perfectly.',
    'Great value for money. Highly recommend!',
    'Superb quality and fast delivery. Love it!',
    'Nice product, good packaging too. Thanks!',
    'Really impressed with the quality. Would order again.',
    'goood welll',
    'Awesome product, very recommended!',
    'Love it! Great experience overall.',
    'Smooth transaction and great product. Thanks seller!',
    'Top notch quality. 5 stars from me!',
    'Very nice, exactly what I expected.',
    'Fantastic purchase! Super happy with it.',
    'Good stuff, fast and reliable. Thanks!'
];

// Desktop User-Agents
const DESKTOP_USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

const CLIENT_HINTS_MAP = {
    'Windows': { platform: '"Windows"', brands: '"Not A(Brand";v="99", "Google Chrome";v="122", "Chromium";v="122"' },
    'Macintosh': { platform: '"macOS"', brands: '"Not A(Brand";v="99", "Google Chrome";v="122", "Chromium";v="122"' },
    'Linux': { platform: '"Linux"', brands: '"Not A(Brand";v="99", "Google Chrome";v="122", "Chromium";v="122"' }
};

// ═══════════════════════════════════════════════════════════
// GLOBAL STATE & DASHBOARD UI
// ═══════════════════════════════════════════════════════════
const state = {
    accounts: [],
    logs: [],
    isRunning: true
};

function formatDuration(ms) {
    if (ms < 0) ms = 0;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}h ${m}m ${s}s`;
}

function logToState(msg) {
    const timestamp = new Date().toLocaleTimeString();
    state.logs.push(`${chalk.gray(`[${timestamp}]`)} ${msg}`);
    if (state.logs.length > LOG_LIMIT) {
        state.logs.shift();
    }
}

const logger = {
    info: (msg, options = {}) => {
        const emoji = options.emoji || 'ℹ️ ';
        const context = options.context ? `[${options.context}]` : '';
        logToState(`${emoji} ${chalk.cyan(context.padEnd(14))} ${msg}`);
        renderTable();
    },
    success: (msg, options = {}) => {
        const emoji = options.emoji || '✅';
        const context = options.context ? `[${options.context}]` : '';
        logToState(`${emoji} ${chalk.cyan(context.padEnd(14))} ${chalk.green(msg)}`);
        renderTable();
    },
    warn: (msg, options = {}) => {
        const emoji = options.emoji || '⚠️ ';
        const context = options.context ? `[${options.context}]` : '';
        logToState(`${emoji} ${chalk.cyan(context.padEnd(14))} ${chalk.yellow(msg)}`);
        renderTable();
    },
    error: (msg, options = {}) => {
        const emoji = options.emoji || '❌';
        const context = options.context ? `[${options.context}]` : '';
        logToState(`${emoji} ${chalk.cyan(context.padEnd(14))} ${chalk.red(msg)}`);
        renderTable();
    }
};

function renderTable() {
    console.clear();

    // Banner
    console.log(chalk.blue(`
               / \\
              /   \\
             |  |  |
             |  |  |
              \\  \\
             |  |  |
             |  |  |
              \\   /
               \\ /
    `));
    console.log(chalk.bold.cyan('    ======SIPAL AIRDROP======'));
    console.log(chalk.bold.cyan('  =====SIPAL SATSUME V1.0====='));
    console.log('');

    // Summary Table
    const table = new Table({
        head: ['Account', 'IP', 'Status', 'Points', 'Diff', 'Last Run', 'Next Run', 'Checkin', 'Faucet', 'Purchase', 'Review'],
        colWidths: [12, 18, 12, 10, 8, 12, 12, 10, 10, 10, 10],
        style: { head: ['cyan'], border: ['grey'] }
    });

    state.accounts.forEach(acc => {
        let statusText = acc.status;
        if (acc.status === 'SUCCESS') statusText = chalk.green(acc.status);
        else if (acc.status === 'FAILED') statusText = chalk.red(acc.status);
        else if (acc.status === 'PROCESSING') statusText = chalk.yellow(acc.status);
        else if (acc.status === 'WAITING') statusText = chalk.blue(acc.status);

        let nextRunStr = '-';
        if (acc.nextRun) {
            const diff = acc.nextRun - Date.now();
            if (diff > 0) nextRunStr = formatDuration(diff);
            else nextRunStr = 'Ready Now';
        }

        let lastRunStr = '-';
        if (acc.lastRun) {
            lastRunStr = new Date(acc.lastRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        let diffDisplay = '-';
        if (acc.diffPoints !== undefined && acc.diffPoints !== null) {
            if (typeof acc.diffPoints === 'number') {
                const sign = acc.diffPoints >= 0 ? '+' : '';
                diffDisplay = chalk.green(`${sign}${acc.diffPoints}`);
            } else if (acc.diffPoints === '?') {
                diffDisplay = chalk.yellow('?');
            }
        }

        table.push([
            `Account ${acc.index}`,
            chalk.magenta(acc.ip || 'Direct'),
            statusText,
            acc.points !== undefined ? acc.points : '-',
            diffDisplay,
            lastRunStr,
            nextRunStr,
            acc.checkin || '-',
            acc.faucet || '-',
            acc.purchase || '-',
            acc.review || '-'
        ]);
    });

    console.log(table.toString());

    // Logs Area
    console.log(chalk.yellow(' EXECUTION LOGS:'));
    state.logs.forEach(log => console.log(log));
    console.log(chalk.bold.cyan('='.repeat(106)));
}

// ═══════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════
async function delay(ms, variance = 0.3) {
    const min = ms * (1 - variance);
    const max = ms * (1 + variance);
    const actual = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, actual));
}

async function microPause() {
    const pauseMs = Math.floor(Math.random() * DELAYS.microPause) + 100;
    return new Promise(resolve => setTimeout(resolve, pauseMs));
}

function getRandomReview() {
    return REVIEW_TEMPLATES[Math.floor(Math.random() * REVIEW_TEMPLATES.length)];
}

function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ═══════════════════════════════════════════════════════════
// FINGERPRINT MODULE
// ═══════════════════════════════════════════════════════════
function loadFingerprints() {
    try {
        if (fs.existsSync(FINGERPRINT_FILE)) {
            return JSON.parse(fs.readFileSync(FINGERPRINT_FILE, 'utf8'));
        }
    } catch (e) { }
    return {};
}

function saveFingerprints(fingerprints) {
    fs.writeFileSync(FINGERPRINT_FILE, JSON.stringify(fingerprints, null, 2));
}

function generateFingerprint(walletAddress) {
    const seed = crypto.createHash('sha256').update(walletAddress.toLowerCase()).digest('hex');
    const uaIndex = parseInt(seed.substring(0, 8), 16) % DESKTOP_USER_AGENTS.length;
    const userAgent = DESKTOP_USER_AGENTS[uaIndex];

    let platform = 'Windows';
    if (userAgent.includes('Macintosh')) platform = 'Macintosh';
    else if (userAgent.includes('Linux')) platform = 'Linux';

    const clientHints = CLIENT_HINTS_MAP[platform];
    const canvasHash = crypto.createHash('md5').update(seed + 'canvas').digest('hex');
    const webglHash = crypto.createHash('md5').update(seed + 'webgl').digest('hex');

    const resolutions = ['1920x1080', '2560x1440', '1366x768', '1440x900', '1536x864'];
    const resIndex = parseInt(seed.substring(8, 16), 16) % resolutions.length;

    const timezones = [-480, -420, -360, -300, -240, 0, 60, 120, 420, 480, 540];
    const tzIndex = parseInt(seed.substring(16, 24), 16) % timezones.length;

    return {
        userAgent, platform,
        clientHints: {
            'sec-ch-ua': clientHints.brands,
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': clientHints.platform
        },
        canvasHash, webglHash,
        screenResolution: resolutions[resIndex],
        timezoneOffset: timezones[tzIndex],
        language: 'en-US',
        languages: ['en-US', 'en'],
        colorDepth: 24,
        hardwareConcurrency: [4, 8, 12, 16][parseInt(seed.substring(24, 32), 16) % 4],
        deviceMemory: [4, 8, 16, 32][parseInt(seed.substring(32, 40), 16) % 4],
        createdAt: new Date().toISOString()
    };
}

function getFingerprint(walletAddress) {
    const fingerprints = loadFingerprints();
    const key = walletAddress.toLowerCase();
    if (!fingerprints[key]) {
        fingerprints[key] = generateFingerprint(walletAddress);
        saveFingerprints(fingerprints);
    }
    return fingerprints[key];
}

function buildHeaders(fingerprint, accessToken = null) {
    const headers = {
        'accept': 'application/json, text/plain, */*',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': `${fingerprint.language},en;q=0.9`,
        'content-type': 'application/json',
        'origin': 'https://satsume.com',
        'referer': 'https://satsume.com/',
        'user-agent': fingerprint.userAgent,
        'sec-ch-ua': fingerprint.clientHints['sec-ch-ua'],
        'sec-ch-ua-mobile': fingerprint.clientHints['sec-ch-ua-mobile'],
        'sec-ch-ua-platform': fingerprint.clientHints['sec-ch-ua-platform'],
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site'
    };
    if (accessToken) headers['x-access-token'] = accessToken;
    return headers;
}

// ═══════════════════════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════════════════════
function createProxyAgent(proxyString) {
    if (!proxyString) return null;
    try {
        if (proxyString.startsWith('socks')) return new SocksProxyAgent(proxyString);
        return new HttpsProxyAgent(proxyString);
    } catch (e) { return null; }
}

function getBackoffDelay(attempt) {
    const d = Math.min(RETRY.baseDelay * Math.pow(2, attempt), RETRY.maxDelay);
    return d + Math.random() * d * 0.1;
}

class ApiClient {
    constructor(fingerprint, proxy = null) {
        this.fingerprint = fingerprint;
        this.accessToken = null;
        this.proxyAgent = createProxyAgent(proxy);
        this.proxyString = proxy || '';
    }

    setAccessToken(token) { this.accessToken = token; }
    getHeaders() { return buildHeaders(this.fingerprint, this.accessToken); }

    async request(method, endpoint, data = null, options = {}) {
        const url = `${BASE_URL}${endpoint}`;
        const maxRetries = options.maxRetries ?? RETRY.maxRetries;
        let lastError = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await microPause();
                const reqConfig = {
                    method, url,
                    headers: this.getHeaders(),
                    timeout: 30000,
                    transformResponse: [(data) => {
                        if (typeof data === 'string') {
                            try {
                                const transformed = data.replace(/:(\d{16,})/g, ':"$1"');
                                return JSON.parse(transformed);
                            } catch (e) { return data; }
                        }
                        return data;
                    }]
                };
                if (data) reqConfig.data = data;
                if (this.proxyAgent) {
                    reqConfig.httpsAgent = this.proxyAgent;
                    reqConfig.httpAgent = this.proxyAgent;
                }
                const response = await axios(reqConfig);
                await delay(DELAYS.minDelay);
                return response.data;
            } catch (error) {
                lastError = error;
                if (error.response?.status === 401 || error.response?.status === 403) {
                    if (options.onAuthError) {
                        const refreshed = await options.onAuthError();
                        if (refreshed) continue;
                    }
                }
                const isRetryable = !error.response || error.response.status >= 500 ||
                    error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
                if (isRetryable && attempt < maxRetries) {
                    const backoff = getBackoffDelay(attempt);
                    await delay(backoff, 0);
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
    }

    async get(endpoint, options = {}) { return this.request('GET', endpoint, null, options); }
    async post(endpoint, data = {}, options = {}) { return this.request('POST', endpoint, data, options); }
}

async function warmupRequests(client) {
    try {
        await delay(DELAYS.minDelay);
        await client.get(ENDPOINTS.userInfo);
        await delay(DELAYS.minDelay);
        await client.get(ENDPOINTS.checkinCalendar);
    } catch (e) { }
}

// ═══════════════════════════════════════════════════════════
// LOGIN MODULE (Auto Private Key Login)
// ═══════════════════════════════════════════════════════════
function loadTokens() {
    try {
        if (fs.existsSync(TOKENS_FILE)) return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    } catch (e) { }
    return {};
}

function saveTokens(tokens) {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

function isTokenExpired(tokenData) {
    if (!tokenData || !tokenData.expiresAt) return true;
    return Date.now() >= (tokenData.expiresAt - 3600000);
}

function parseJwtExpiry(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        return payload.exp ? payload.exp * 1000 : null;
    } catch (e) { return null; }
}

function parseJwtUserId(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        return payload.userId || null;
    } catch (e) { return null; }
}

function getWalletAddress(privateKey) {
    return new ethers.Wallet(privateKey).address;
}

/**
 * Fetch reCAPTCHA v3 token using anchor-reload technique
 */
async function fetchRecaptchaToken(proxy = null) {
    try {
        const co = Buffer.from(`${RECAPTCHA_SITE_URL}:443`).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

        const agentConfig = {};
        if (proxy) {
            const agent = createProxyAgent(proxy);
            if (agent) { agentConfig.httpsAgent = agent; agentConfig.httpAgent = agent; }
        }

        // Step 1: Get anchor page to obtain initial recaptcha token
        const anchorUrl = `https://www.google.com/recaptcha/api2/anchor?ar=1&k=${RECAPTCHA_SITE_KEY}&co=${co}&hl=en&v=gYdqkxiddE5aXrugNbBbKgtN&size=invisible&cb=${Date.now()}`;
        const anchorRes = await axios.get(anchorUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            },
            timeout: 15000,
            ...agentConfig
        });

        const tokenMatch = anchorRes.data.match(/recaptcha-token[^>]*value="([^"]+)"/);
        if (!tokenMatch) return null;
        const initialToken = tokenMatch[1];

        // Step 2: Reload to get the real token
        const reloadUrl = `https://www.google.com/recaptcha/api2/reload?k=${RECAPTCHA_SITE_KEY}`;
        const reloadRes = await axios.post(reloadUrl,
            `v=gYdqkxiddE5aXrugNbBbKgtN&reason=q&c=${encodeURIComponent(initialToken)}&k=${RECAPTCHA_SITE_KEY}&co=${co}&hl=en&size=invisible`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Referer': `https://www.google.com/recaptcha/api2/anchor?ar=1&k=${RECAPTCHA_SITE_KEY}&co=${co}&hl=en&v=gYdqkxiddE5aXrugNbBbKgtN&size=invisible`
                },
                timeout: 15000,
                ...agentConfig
            }
        );

        const rTokenMatch = reloadRes.data.match(/rresp","([^"]+)"/);
        if (rTokenMatch) return rTokenMatch[1];

        // Fallback: try alternative pattern
        const altMatch = reloadRes.data.match(/"rresp","([^"]+)"/);
        if (altMatch) return altMatch[1];

        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Get nonce from server - tries multiple approaches for captcha
 */
async function getNonce(apiClient, address, proxy = null) {
    // Attempt 1: Try with reCAPTCHA token (anchor-reload)
    const captchaToken = await fetchRecaptchaToken(proxy);
    if (captchaToken) {
        try {
            const endpoint = `${ENDPOINTS.loginNonce}?address=${address}&token=${encodeURIComponent(captchaToken)}`;
            const response = await apiClient.get(endpoint, { maxRetries: 1 });
            if (response && response.code === 200 && response.data) {
                return { success: true, nonce: response.data.nonce || response.data };
            }
        } catch (e) { /* try next approach */ }
    }

    // Attempt 2: Try without token parameter
    try {
        const endpoint = `${ENDPOINTS.loginNonce}?address=${address}`;
        const response = await apiClient.get(endpoint, { maxRetries: 1 });
        if (response && response.code === 200 && response.data) {
            return { success: true, nonce: response.data.nonce || response.data };
        }
    } catch (e) { /* try next approach */ }

    // Attempt 3: Try with empty token
    try {
        const endpoint = `${ENDPOINTS.loginNonce}?address=${address}&token=`;
        const response = await apiClient.get(endpoint, { maxRetries: 1 });
        if (response && response.code === 200 && response.data) {
            return { success: true, nonce: response.data.nonce || response.data };
        }
    } catch (e) { /* all attempts failed */ }

    return { success: false, error: 'Failed to obtain nonce (captcha may be required)' };
}

async function login(apiClient, privateKey, proxy = null) {
    const wallet = new ethers.Wallet(privateKey);
    const address = wallet.address;
    const tokens = loadTokens();
    const tokenKey = address.toLowerCase();

    // Check cached token first
    if (tokens[tokenKey] && !isTokenExpired(tokens[tokenKey])) {
        apiClient.setAccessToken(tokens[tokenKey].accessToken);
        return { success: true, cached: true, address, userId: tokens[tokenKey].userId };
    }

    // Auto login with private key (2-step: nonce -> sign -> login)
    try {
        // Step 1: Get nonce from server
        const nonceResult = await getNonce(apiClient, address, proxy);
        if (!nonceResult.success) {
            return { success: false, error: nonceResult.error, address };
        }
        const nonce = nonceResult.nonce;

        // Step 2: Sign the login message (exact format from Satsume frontend)
        const message = `Please sign to login to your Satsume account, address: ${address.toLowerCase()}, nonce: ${nonce}`;
        const signature = await wallet.signMessage(message);

        // Step 3: POST login
        const loginResponse = await apiClient.post(ENDPOINTS.login, {
            address: address,
            message: message,
            signature: signature,
            inviteId: ''
        });

        if (loginResponse.code === 200 && loginResponse.data) {
            const accessToken = loginResponse.data.accessToken || loginResponse.data.token;
            if (accessToken) {
                const expiresAt = parseJwtExpiry(accessToken);
                const userId = parseJwtUserId(accessToken);
                tokens[tokenKey] = { accessToken, userId, expiresAt: expiresAt || (Date.now() + 86400000), createdAt: new Date().toISOString() };
                saveTokens(tokens);
                apiClient.setAccessToken(accessToken);
                return { success: true, cached: false, address, userId };
            }
        }
        return { success: false, error: loginResponse.message || 'Login failed - no token received', address };
    } catch (error) {
        const errMsg = error.response?.data?.message || error.response?.data?.reason || error.message;
        return { success: false, error: errMsg, address };
    }
}

// ═══════════════════════════════════════════════════════════
// POINTS MODULE
// ═══════════════════════════════════════════════════════════
async function getUserPoints(apiClient) {
    try {
        const response = await apiClient.get(ENDPOINTS.userInfo);
        if (response.code === 200 && response.data) {
            return { success: true, points: response.data.points || 0 };
        }
        return { success: false, error: response.message || 'Failed to fetch points' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ═══════════════════════════════════════════════════════════
// CHECKIN MODULE
// ═══════════════════════════════════════════════════════════
async function performCheckin(apiClient) {
    try {
        const response = await apiClient.post(ENDPOINTS.checkin, {});

        if (response.code === 200) {
            const data = response.data || {};
            return {
                success: true,
                pointsEarned: data.pointsEarned || data.points || 0,
                consecutiveDays: data.consecutiveDays || data.streak || 0,
                message: 'Check-in successful'
            };
        }

        // Already checked in today => treat as ALREADY, not FAILED
        if (response.code === 400 || (response.message && (
            response.message.toLowerCase().includes('already') ||
            response.message.toLowerCase().includes('checked') ||
            response.message.toLowerCase().includes('today') ||
            response.message.toLowerCase().includes('done')
        ))) {
            return {
                success: true,
                alreadyDone: true,
                pointsEarned: 0,
                message: 'Already checked in today'
            };
        }

        return { success: false, error: response.message || 'Check-in failed' };
    } catch (error) {
        const errMsg = error.response?.data?.message || error.message || '';
        // Also catch "already" in error responses
        if (errMsg.toLowerCase().includes('already') || errMsg.toLowerCase().includes('checked') || errMsg.toLowerCase().includes('today')) {
            return { success: true, alreadyDone: true, pointsEarned: 0, message: 'Already checked in today' };
        }
        return { success: false, error: errMsg };
    }
}

// ═══════════════════════════════════════════════════════════
// FAUCET MODULE (NUSD DailyMint)
// ═══════════════════════════════════════════════════════════
function createSigner(privateKey) {
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    return new ethers.Wallet(privateKey, provider);
}

async function getNusdBalance(address) {
    try {
        const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
        const contract = new ethers.Contract(NUSD_CONTRACT, NUSD_ABI, provider);
        const balance = await contract.balanceOf(address);
        return parseFloat(ethers.formatEther(balance));
    } catch (error) { return 0; }
}

async function performFaucetClaim(privateKey) {
    try {
        const signer = createSigner(privateKey);
        const address = await signer.getAddress();
        const balanceBefore = await getNusdBalance(address);
        const contract = new ethers.Contract(NUSD_CONTRACT, NUSD_ABI, signer);

        let tx;
        let functionUsed = '';
        let lastFaucetError = '';
        const functions = ['dailyMint', 'claimDailyTokens', 'faucet', 'mint'];

        for (const funcName of functions) {
            try {
                if (contract[funcName]) {
                    tx = await contract[funcName]();
                    functionUsed = funcName;
                    break;
                }
            } catch (e) {
                const errMsg = e.reason || e.shortMessage || e.message || '';
                lastFaucetError = errMsg;
                // If "already minted" or "reverted" => already claimed today
                if (errMsg.toLowerCase().includes('already') || errMsg.toLowerCase().includes('minted today') ||
                    errMsg.toLowerCase().includes('once per day') || errMsg.toLowerCase().includes('reverted')) {
                    return { success: true, alreadyDone: true, message: 'Already claimed NUSD today' };
                }
                continue;
            }
        }

        if (!tx) return { success: false, error: lastFaucetError || 'Could not find faucet function' };

        const receipt = await tx.wait();
        const balanceAfter = await getNusdBalance(address);
        const claimed = parseFloat(balanceAfter) - parseFloat(balanceBefore);

        return {
            success: true,
            txHash: receipt.hash,
            claimed: claimed.toFixed(0),
            balanceAfter,
            function: functionUsed,
            message: `Claimed ${claimed.toFixed(0)} NUSD`
        };
    } catch (error) {
        const errorMsg = error.message || '';

        // Already claimed today => ALREADY, not FAILED
        if (errorMsg.includes('already claimed') ||
            errorMsg.includes('once per day') ||
            errorMsg.includes('execution reverted') ||
            errorMsg.includes('DailyMint') ||
            error.shortMessage?.includes('reverted')) {
            return {
                success: true,
                alreadyDone: true,
                message: 'Already claimed NUSD today'
            };
        }

        if (errorMsg.includes('insufficient funds')) {
            return { success: false, error: 'Insufficient gas (need Sepolia ETH)' };
        }

        return { success: false, error: error.shortMessage || error.message };
    }
}

// ═══════════════════════════════════════════════════════════
// PURCHASE MODULE
// ═══════════════════════════════════════════════════════════
async function fetchProductList(apiClient) {
    try {
        const response = await apiClient.get(`${ENDPOINTS.productList}?page=0&size=50&sort=,desc`);
        if (response.code !== 200 || !response.data || !response.data.content) {
            return { success: false, error: response.message || 'Failed to fetch products' };
        }
        const products = response.data.content
            .filter(p => p.status === 2 && p.stockQuantity > 0)
            .map(p => ({
                id: p.id?.toString() || p.id,
                name: p.name,
                price: parseInt(p.originalPrice) || 0,
                stock: p.stockQuantity,
                symbol: p.symbol,
                storeName: p.storeName
            }))
            .filter(p => p.price > 0);
        products.sort((a, b) => a.price - b.price);
        return { success: true, products };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function fetchProductDetail(apiClient, productId) {
    try {
        const response = await apiClient.get(`${ENDPOINTS.productDetail}/${productId}`);
        if (response.code !== 200 || !response.data) return { success: false, error: response.message || 'Product not found' };
        const skus = response.data.productSkus;
        if (!skus || skus.length === 0) return { success: false, error: 'No SKU available' };
        const validSku = skus.find(s => s.isEnabled !== false && (s.stock > 0 || s.stock === undefined));
        if (!validSku) return { success: false, error: 'No valid SKU in stock' };
        return { success: true, skuId: validSku.id?.toString() || validSku.id, skuPrice: parseInt(validSku.price) || 0, stock: validSku.stock, promotionId: response.data.promotionId || null };
    } catch (error) { return { success: false, error: error.message }; }
}

async function createOrder(apiClient, skuId, promotionId) {
    try {
        const payload = { skuId: skuId.toString(), quantity: 1, addressId: '', cartId: '' };
        if (promotionId) payload.promotionId = promotionId;
        const response = await apiClient.post(ENDPOINTS.createOrder, payload);
        if (response.code === 200 && response.data) return { success: true, orderId: response.data.toString() };
        return { success: false, error: response.message || response.reason || 'Failed to create order', code: response.code };
    } catch (error) { return { success: false, error: error.response?.data?.message || error.message }; }
}

async function getPaymentData(apiClient, orderId) {
    try {
        const response = await apiClient.post(ENDPOINTS.payOrder, { orderId: orderId.toString() });
        if (response.code === 200 && response.data) return { success: true, paymentData: response.data };
        return { success: false, error: response.message || response.reason || 'Failed to get payment data' };
    } catch (error) { return { success: false, error: error.response?.data?.message || error.message }; }
}

async function signNusdPermit(signer, spender, value, deadline) {
    const owner = await signer.getAddress();
    const nusdContract = new ethers.Contract(NUSD_CONTRACT, NUSD_ABI, signer.provider);

    // Fetch nonce and domain name in parallel (dynamic domain name to match contract)
    let nonce, domainName;
    try {
        const namePromise = _nusdNameCache
            ? Promise.resolve(_nusdNameCache)
            : nusdContract.name().then(n => { _nusdNameCache = n; return n; });
        [nonce, domainName] = await Promise.all([
            nusdContract.nonces(owner),
            namePromise
        ]);
    } catch (e) {
        // Fallback: fetch nonce only, use hardcoded domain name
        nonce = await nusdContract.nonces(owner);
        domainName = NUSD_PERMIT_DOMAIN.name;
    }

    // Build domain with dynamically fetched name
    const domain = { ...NUSD_PERMIT_DOMAIN, name: domainName };
    if (domainName !== NUSD_PERMIT_DOMAIN.name) {
        logger.warn(`NUSD domain name mismatch: contract="${domainName}" vs hardcoded="${NUSD_PERMIT_DOMAIN.name}". Using contract value.`, { context: 'Permit' });
    }

    const permitMessage = { owner, spender, value, nonce, deadline };
    const signature = await signer.signTypedData(domain, PERMIT_TYPES, permitMessage);
    const sig = ethers.Signature.from(signature);
    return { v: sig.v, r: sig.r, s: sig.s };
}

async function executePaymentOnChain(privateKey, paymentData, ctx) {
    try {
        const signer = createSigner(privateKey);
        const address = await signer.getAddress();
        const contractAddress = paymentData.address;
        const paymentContract = new ethers.Contract(contractAddress, PAYMENT_ABI, signer);

        // Parse deadline using BigInt to avoid precision loss
        let deadline;
        try {
            deadline = BigInt(paymentData.deadline);
        } catch {
            return { success: false, error: 'Invalid deadline in payment data' };
        }

        // Deadline validation: detect seconds vs milliseconds
        // Unix timestamp in seconds is ~10 digits, in milliseconds ~13 digits
        const nowSec = BigInt(Math.floor(Date.now() / 1000));
        const deadlineSec = deadline > 10000000000n ? deadline / 1000n : deadline;
        const remainingSec = deadlineSec - nowSec;

        if (remainingSec <= 0n) {
            return { success: false, error: `Deadline already expired (${Number(-remainingSec)}s ago)` };
        }
        if (remainingSec < 60n) {
            return { success: false, error: `Deadline too close (${Number(remainingSec)}s left, need >60s)` };
        }

        // Check NUSD balance before proceeding
        const totalAmount = BigInt(paymentData.totalAmount);
        const nusdContract = new ethers.Contract(NUSD_CONTRACT, NUSD_ABI, signer.provider);
        const nusdBalance = await nusdContract.balanceOf(address);

        if (nusdBalance < totalAmount) {
            const have = ethers.formatEther(nusdBalance);
            const need = ethers.formatEther(totalAmount);
            return { success: false, error: `Insufficient NUSD: have ${have}, need ${need}` };
        }

        logger.info('Signing NUSD permit...', { context: ctx });
        const permitSig = await signNusdPermit(signer, contractAddress, totalAmount, deadline);

        // Build call params (17 params: 10 order fields + marketingRuleId + 3 order sig + 3 permit sig)
        // Server signs verifySignature hash: encodePacked(params + marketingRuleId + shopContract + buyer)
        // Contract uses verifySignature with toEthSignedMessageHash + ECDSA
        const marketingRuleId = BigInt(paymentData.marketingRuleId || 0);
        const callParams = [
            BigInt(paymentData.orderId), BigInt(paymentData.skuId), BigInt(paymentData.price),
            BigInt(paymentData.inventory), BigInt(paymentData.inventoryVersion), BigInt(paymentData.quantity),
            totalAmount, BigInt(paymentData.shippingFee), deadline, BigInt(paymentData.nonce),
            marketingRuleId,
            paymentData.v, paymentData.r, paymentData.s,
            permitSig.v, permitSig.r, permitSig.s
        ];

        // Pre-flight simulation via eth_call (catches reverts BEFORE sending tx)
        logger.info('Simulating transaction...', { context: ctx });
        try {
            await paymentContract.purchaseWithMarketingAndPermit.staticCall(...callParams);
        } catch (simError) {
            const reason = simError.revert?.args?.[0] || simError.reason || simError.shortMessage || simError.message;
            return { success: false, error: `Simulation failed: ${reason}` };
        }

        // Estimate gas dynamically with fallback
        let gasLimit = 500000n;
        try {
            const estimated = await paymentContract.purchaseWithMarketingAndPermit.estimateGas(...callParams);
            gasLimit = estimated * 150n / 100n; // 50% buffer
            if (gasLimit < 300000n) gasLimit = 300000n;
        } catch {
            gasLimit = 500000n;
        }

        // Send actual transaction
        logger.info('Sending on-chain transaction...', { context: ctx });
        const tx = await paymentContract.purchaseWithMarketingAndPermit(...callParams, { gasLimit });

        logger.info(`Tx sent: ${tx.hash.slice(0, 16)}... confirming...`, { context: ctx });

        // Wait for confirmation with 120s timeout
        const receipt = await Promise.race([
            tx.wait(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction confirmation timeout (120s)')), 120000))
        ]);

        if (receipt.status === 0) return { success: false, error: 'Transaction reverted on-chain' };
        return { success: true, txHash: receipt.hash };
    } catch (error) {
        const msg = error.shortMessage || error.reason || error.message || 'Unknown error';
        if (msg.includes('insufficient funds')) {
            return { success: false, error: 'Insufficient Sepolia ETH for gas fees' };
        }
        if (msg.includes('nonce')) {
            return { success: false, error: `Nonce conflict: ${msg}` };
        }
        return { success: false, error: msg };
    }
}

async function submitOrderTx(apiClient, orderId, txHash) {
    try {
        const response = await apiClient.post(ENDPOINTS.submitOrder, { orderId: orderId.toString(), txHash });
        return { success: response.code === 200 };
    } catch (error) { return { success: true }; }
}

async function logPurchaseActivity(apiClient, userId) {
    try { await apiClient.post(ENDPOINTS.activityLog, { path: '/order/submit', userId: userId.toString() }); } catch (e) { }
}

async function performPurchase(apiClient, userId, privateKey, ctx) {
    try {
        const wallet = new ethers.Wallet(privateKey);
        const address = wallet.address;
        const balanceNusd = await getNusdBalance(address);

        logger.info(`NUSD Balance: ${balanceNusd.toLocaleString()} NUSD`, { context: ctx });

        if (balanceNusd <= 0) return { success: false, error: 'No NUSD balance' };

        // Check Sepolia ETH for gas
        try {
            const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
            const ethBal = await provider.getBalance(address);
            const ethBalFormatted = parseFloat(ethers.formatEther(ethBal));
            logger.info(`Sepolia ETH: ${ethBalFormatted.toFixed(4)} ETH`, { context: ctx });
            if (ethBal < ethers.parseEther('0.0005')) {
                return { success: false, error: `Insufficient Sepolia ETH for gas: ${ethBalFormatted.toFixed(4)} ETH` };
            }
        } catch (e) {
            logger.warn(`Could not check ETH balance: ${e.message}`, { context: ctx });
        }

        logger.info('Fetching product list...', { context: ctx });
        const listResult = await fetchProductList(apiClient);
        if (!listResult.success) return { success: false, error: `Product list failed: ${listResult.error}` };

        const allProducts = listResult.products;
        logger.info(`Found ${allProducts.length} products`, { context: ctx });

        if (allProducts.length === 0) return { success: false, error: 'No products available' };

        const affordable = allProducts.filter(p => p.price <= balanceNusd);
        if (affordable.length === 0) {
            return { success: false, error: `Can't afford any product. Cheapest: ${allProducts[0].price} NUSD` };
        }

        const halfIdx = Math.max(1, Math.ceil(affordable.length * 0.5));
        const tryOrder = [...shuffleArray(affordable.slice(0, halfIdx)), ...affordable.slice(halfIdx)];

        let lastError = '';
        let consecutiveOnChainFails = 0;
        const MAX_CONSECUTIVE_ONCHAIN_FAILS = 5;

        for (let i = 0; i < tryOrder.length; i++) {
            const product = tryOrder[i];
            logger.info(`[${i + 1}/${tryOrder.length}] Trying: ${product.name} (${product.price} NUSD)`, { context: ctx });

            try {
                const detailResult = await fetchProductDetail(apiClient, product.id);
                if (!detailResult.success) { lastError = detailResult.error; continue; }

                logger.info(`Creating order (SKU: ${detailResult.skuId})...`, { context: ctx });
                const orderResult = await createOrder(apiClient, detailResult.skuId, detailResult.promotionId);
                if (!orderResult.success) { lastError = orderResult.error; continue; }

                logger.info(`Order created: ${orderResult.orderId}`, { context: ctx });

                // On-chain payment with retry (up to 2 attempts per product)
                let onChainSuccess = false;
                let onChainResult;

                for (let attempt = 0; attempt < 2; attempt++) {
                    if (attempt > 0) {
                        logger.info(`Retrying on-chain payment (attempt ${attempt + 1})...`, { context: ctx });
                        await delay(3000);
                    }

                    const payResult = await getPaymentData(apiClient, orderResult.orderId);
                    if (!payResult.success) {
                        lastError = payResult.error;
                        break;
                    }

                    onChainResult = await executePaymentOnChain(privateKey, payResult.paymentData, ctx);
                    if (onChainResult.success) {
                        onChainSuccess = true;
                        break;
                    }

                    lastError = onChainResult.error;

                    // Don't retry on non-recoverable errors
                    if (lastError.includes('Insufficient NUSD') ||
                        lastError.includes('Insufficient Sepolia ETH') ||
                        lastError.includes('Deadline already expired') ||
                        lastError.includes('Invalid deadline')) {
                        break;
                    }
                }

                if (onChainSuccess) {
                    consecutiveOnChainFails = 0;
                    logger.success(`Tx confirmed: ${onChainResult.txHash.slice(0, 20)}...`, { context: ctx });
                    await submitOrderTx(apiClient, orderResult.orderId, onChainResult.txHash);
                    await logPurchaseActivity(apiClient, userId);

                    return {
                        success: true,
                        orderId: orderResult.orderId,
                        txHash: onChainResult.txHash,
                        product: product.name,
                        price: product.price,
                        message: `Bought "${product.name}" for ${product.price.toLocaleString()} NUSD`
                    };
                } else {
                    consecutiveOnChainFails++;
                    logger.warn(`On-chain failed [${consecutiveOnChainFails}/${MAX_CONSECUTIVE_ONCHAIN_FAILS}]: ${lastError}`, { context: ctx });

                    // Early exit on systemic on-chain failures
                    if (consecutiveOnChainFails >= MAX_CONSECUTIVE_ONCHAIN_FAILS) {
                        return { success: false, error: `${consecutiveOnChainFails} consecutive on-chain failures. Last: ${lastError}` };
                    }

                    // Early exit on non-recoverable errors
                    if (lastError.includes('Insufficient NUSD') ||
                        lastError.includes('Insufficient Sepolia ETH')) {
                        return { success: false, error: lastError };
                    }
                }
            } catch (error) { lastError = error.message; continue; }
        }
        return { success: false, error: `All ${tryOrder.length} products failed. Last: ${lastError}` };
    } catch (error) { return { success: false, error: error.message }; }
}

// ═══════════════════════════════════════════════════════════
// REVIEW MODULE
// ═══════════════════════════════════════════════════════════
async function getReviewableOrders(apiClient) {
    try {
        const response = await apiClient.get(`${ENDPOINTS.ordersList}?page=0&size=20&status=`);
        if (response.code !== 200 || !response.data) return { success: false, orders: [], error: response.message || 'Failed to fetch orders' };
        const allOrders = response.data.content || [];
        const reviewable = allOrders.filter(order => {
            const isPaid = order.status === 3 || order.status === '3';
            const notReviewed = !order.reviewId;
            return isPaid && notReviewed;
        });
        return { success: true, orders: reviewable, totalOrders: allOrders.length };
    } catch (error) { return { success: false, orders: [], error: error.message }; }
}

async function submitReview(apiClient, orderId, rating = 5, content = null) {
    try {
        const reviewContent = content || getRandomReview();
        const response = await apiClient.post(ENDPOINTS.submitReview, {
            orderId: orderId.toString(),
            rating: rating,
            content: reviewContent,
            isAnonymous: false
        });
        if (response.code === 200) return { success: true, message: `Review submitted: "${reviewContent.slice(0, 30)}..."` };
        return { success: false, error: response.message || 'Failed to submit review' };
    } catch (error) { return { success: false, error: error.response?.data?.message || error.message }; }
}

async function logReviewActivity(apiClient, userId) {
    try { await apiClient.post(ENDPOINTS.activityLog, { path: '/order/list', userId: userId.toString() }); } catch (e) { }
}

async function performReview(apiClient, userId, orderId, ctx) {
    try {
        let reviewedCount = 0;
        let lastMessage = '';

        if (orderId) {
            logger.info(`Reviewing just-purchased order: ${orderId}`, { context: ctx });
            await delay(2000);
            const result = await submitReview(apiClient, orderId, 5);
            if (result.success) {
                reviewedCount++;
                lastMessage = result.message;
                logger.success(result.message, { context: ctx });
                await logReviewActivity(apiClient, userId);
            } else {
                logger.warn(`Review failed: ${result.error}`, { context: ctx });
            }
        }

        logger.info('Checking for unreviewed orders...', { context: ctx });
        await delay(1500);
        const ordersResult = await getReviewableOrders(apiClient);

        if (!ordersResult.success) {
            if (reviewedCount > 0) return { success: true, message: `Reviewed ${reviewedCount} order(s)` };
            return { success: false, error: `Fetch orders failed: ${ordersResult.error}` };
        }

        const pendingOrders = ordersResult.orders;
        logger.info(`Found ${pendingOrders.length} unreviewed orders`, { context: ctx });

        if (pendingOrders.length === 0 && reviewedCount === 0) {
            return { success: true, skipped: true, message: 'No orders pending review' };
        }

        for (const order of pendingOrders) {
            const oid = order.id?.toString() || order.id;
            if (orderId && oid === orderId.toString()) continue;

            const productName = order.snapshot?.productName || 'Unknown';
            logger.info(`Reviewing: ${productName}...`, { context: ctx });
            await delay(2000);

            const result = await submitReview(apiClient, oid, 5);
            if (result.success) {
                reviewedCount++;
                lastMessage = result.message;
                logger.success(result.message, { context: ctx });
                await logReviewActivity(apiClient, userId);
                await delay(1500);
            } else {
                logger.warn(`Review failed: ${result.error}`, { context: ctx });
            }
        }

        if (reviewedCount > 0) return { success: true, message: `Reviewed ${reviewedCount} order(s). ${lastMessage}` };
        return { success: true, skipped: true, message: 'All orders already reviewed' };
    } catch (error) { return { success: false, error: error.message }; }
}

// ═══════════════════════════════════════════════════════════
// ACCOUNT LOADER
// ═══════════════════════════════════════════════════════════
function loadAccounts() {
    const accountsPath = path.join(__dirname, 'accounts.json');

    if (!fs.existsSync(accountsPath)) {
        console.log(chalk.red('accounts.json not found!'));
        console.log(chalk.yellow('Please copy accounts_tmp.json to accounts.json and fill in your data.'));
        process.exit(1);
    }

    try {
        let accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));

        if (typeof accounts === 'string') {
            accounts = [{ name: 'Account1', privateKey: accounts, proxy: '' }];
        }
        if (Array.isArray(accounts) && typeof accounts[0] === 'string') {
            accounts = accounts.map((pk, i) => ({ name: `Account${i + 1}`, privateKey: pk, proxy: '' }));
        }

        const valid = accounts.filter(acc => {
            let pk = acc.privateKey || acc.pk || acc;
            if (typeof pk === 'string') {
                pk = pk.trim();
                if (!pk.startsWith('0x')) pk = '0x' + pk;
                if (pk.length === 66) { acc.privateKey = pk; return true; }
            }
            return false;
        });

        if (valid.length === 0) {
            console.log(chalk.red('No valid accounts found in accounts.json'));
            process.exit(1);
        }
        return valid;
    } catch (e) {
        console.log(chalk.red('Failed to parse accounts.json:'), e.message);
        process.exit(1);
    }
}

// ═══════════════════════════════════════════════════════════
// PROXY IP LOOKUP
// ═══════════════════════════════════════════════════════════
async function getPublicIp(proxy) {
    try {
        const config = { url: 'https://api.ipify.org?format=json', timeout: 10000 };
        if (proxy) {
            const agent = createProxyAgent(proxy);
            if (agent) { config.httpsAgent = agent; config.httpAgent = agent; }
        }
        const res = await axios(config);
        return res.data.ip || 'Unknown';
    } catch (e) { return 'Direct'; }
}

// ═══════════════════════════════════════════════════════════
// TASK RUNNER
// ═══════════════════════════════════════════════════════════
async function runAccountTasks(account, index) {
    const ctx = `Account ${index + 1}`;
    const accState = state.accounts[index];

    accState.status = 'PROCESSING';
    accState.checkin = '-';
    accState.faucet = '-';
    accState.purchase = '-';
    accState.review = '-';
    accState.diffPoints = 0; // Reset diff for new run
    renderTable();

    let userId;
    let initialPoints = null; // Use null to track fetch success

    try {
        const walletAddress = getWalletAddress(account.privateKey);
        logger.info(`Wallet: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`, { context: ctx });

        const fingerprint = getFingerprint(walletAddress);
        const apiClient = new ApiClient(fingerprint, account.proxy);

        // Login
        logger.info('Logging in...', { context: ctx });
        const loginResult = await login(apiClient, account.privateKey, account.proxy);
        if (!loginResult.success) throw new Error(`Login failed: ${loginResult.error}`);

        userId = loginResult.userId;
        const loginType = loginResult.cached ? '(cached)' : '(fresh)';
        logger.success(`Login ${loginType} - ID: ${userId}`, { context: ctx });

        // Warmup
        logger.info('Warming up...', { context: ctx });
        await warmupRequests(apiClient);

        // Fetch Initial Points
        const pointsBefore = await getUserPoints(apiClient);
        if (pointsBefore.success) {
            initialPoints = pointsBefore.points;
            accState.points = initialPoints;
            logger.info(`Initial Points: ${initialPoints}`, { context: ctx });
        } else {
            logger.warn(`Could not fetch initial points: ${pointsBefore.error}`, { context: ctx });
        }
        renderTable();

        await delay(DELAYS.taskDelay);

        // === TASK 1: Check-in ===
        logger.info('Performing check-in...', { context: ctx });
        const checkinResult = await performCheckin(apiClient);

        if (checkinResult.success) {
            if (checkinResult.alreadyDone) {
                accState.checkin = chalk.yellow('ALREADY');
                logger.warn('Check-in: Already done today', { context: ctx });
            } else {
                accState.checkin = chalk.green('SUCCESS');
                logger.success(`Check-in: +${checkinResult.pointsEarned} pts`, { context: ctx });
            }
        } else {
            accState.checkin = chalk.red('FAILED');
            logger.error(`Check-in failed: ${checkinResult.error}`, { context: ctx });
        }
        renderTable();
        await delay(DELAYS.taskDelay);

        // === TASK 2: Faucet ===
        logger.info('Claiming NUSD faucet...', { context: ctx });
        const faucetResult = await performFaucetClaim(account.privateKey);

        if (faucetResult.success) {
            if (faucetResult.alreadyDone) {
                accState.faucet = chalk.yellow('ALREADY');
                logger.warn('Faucet: Already claimed today', { context: ctx });
            } else {
                accState.faucet = chalk.green('SUCCESS');
                logger.success(`Faucet: ${faucetResult.message}`, { context: ctx });
                if (faucetResult.txHash) logger.info(`Tx: ${faucetResult.txHash.slice(0, 20)}...`, { context: ctx });
            }
        } else {
            accState.faucet = chalk.red('FAILED');
            logger.error(`Faucet failed: ${faucetResult.error}`, { context: ctx });
        }
        renderTable();
        await delay(DELAYS.taskDelay);

        // === TASK 3: Purchase ===
        logger.info('Performing purchase...', { context: ctx });
        const purchaseResult = await performPurchase(apiClient, userId, account.privateKey, ctx);

        if (purchaseResult.success) {
            accState.purchase = chalk.green('SUCCESS');
            logger.success(`Purchase: ${purchaseResult.message}`, { context: ctx });
        } else {
            accState.purchase = chalk.red('FAILED');
            logger.error(`Purchase failed: ${purchaseResult.error}`, { context: ctx });
        }
        renderTable();
        await delay(DELAYS.taskDelay);

        // === TASK 4: Review ===
        logger.info('Submitting review...', { context: ctx });
        const reviewResult = await performReview(apiClient, userId, purchaseResult.orderId, ctx);

        if (reviewResult.success) {
            if (reviewResult.skipped) {
                accState.review = chalk.yellow('ALREADY');
                logger.warn('Review: No pending reviews', { context: ctx });
            } else {
                accState.review = chalk.green('SUCCESS');
                logger.success(`Review: ${reviewResult.message}`, { context: ctx });
            }
        } else {
            accState.review = chalk.red('FAILED');
            logger.error(`Review failed: ${reviewResult.error}`, { context: ctx });
        }

        accState.status = 'SUCCESS';
        accState.lastRun = Date.now();
        logger.success('All tasks completed!', { context: ctx });

        // Fetch Final Points
        const pointsAfter = await getUserPoints(apiClient);
        if (pointsAfter.success) {
            const finalPoints = pointsAfter.points;
            accState.points = finalPoints;

            if (initialPoints !== null) {
                accState.diffPoints = finalPoints - initialPoints;
                const sign = accState.diffPoints >= 0 ? '+' : '';
                logger.success(`Final Points: ${finalPoints} (${sign}${accState.diffPoints})`, { context: ctx });
            } else {
                accState.diffPoints = '?';
                logger.success(`Final Points: ${finalPoints}`, { context: ctx });
            }
        } else {
            logger.warn(`Could not fetch final points: ${pointsAfter.error}`, { context: ctx });
        }


    } catch (error) {
        accState.status = 'FAILED';
        accState.lastRun = Date.now();
        logger.error(`Error: ${error.message}`, { context: ctx });
    }

    renderTable();
}

// ═══════════════════════════════════════════════════════════
// SCHEDULER
// ═══════════════════════════════════════════════════════════
function getNextResetTime() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), SCHEDULE_RESET_HOUR_UTC, 0, 0, 0));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next;
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
async function main() {
    const accounts = loadAccounts();

    // Initialize state for each account
    for (let i = 0; i < accounts.length; i++) {
        const ip = accounts[i].proxy ? await getPublicIp(accounts[i].proxy) : 'Direct';
        state.accounts.push({
            index: i + 1,
            ip: ip,
            status: 'WAITING',
            lastRun: null,
            nextRun: null,
            checkin: '-',
            faucet: '-',
            purchase: '-',
            review: '-',
            points: '-',
            diffPoints: '-'
        });
    }

    renderTable();
    logger.info(`Loaded ${accounts.length} account(s)`, { context: 'System' });

    while (true) {
        // Run tasks for each account
        for (let i = 0; i < accounts.length; i++) {
            state.accounts[i].status = 'PROCESSING';
            renderTable();

            await runAccountTasks(accounts[i], i);

            // Delay between accounts
            if (i < accounts.length - 1) {
                const accountDelay = Math.floor(Math.random() * 10000) + 5000;
                logger.info(`Waiting ${Math.round(accountDelay / 1000)}s before next account...`, { context: 'System' });
                await delay(accountDelay, 0.1);
            }
        }

        // Calculate next run
        const nextReset = getNextResetTime();
        const waitMs = nextReset.getTime() - Date.now();

        // Update all accounts with next run time
        for (let i = 0; i < state.accounts.length; i++) {
            if (state.accounts[i].status !== 'FAILED') {
                state.accounts[i].status = 'WAITING';
            }
            state.accounts[i].nextRun = nextReset.getTime();
        }

        logger.info(`Next run at: ${nextReset.toLocaleString()} (${formatDuration(waitMs)})`, { context: 'Schedule' });
        renderTable();

        // Periodically update the dashboard countdown
        const updateInterval = setInterval(() => { renderTable(); }, 60000);

        await new Promise(resolve => setTimeout(resolve, waitMs));
        clearInterval(updateInterval);

        // Reset states for new cycle
        for (let i = 0; i < state.accounts.length; i++) {
            state.accounts[i].status = 'WAITING';
            state.accounts[i].nextRun = null;
        }
        state.logs = [];
    }
}

// ═══════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════
process.on('uncaughtException', (err) => {
    fs.appendFileSync('error.log', `[${new Date().toISOString()}] UNCAUGHT: ${err.stack}\n`);
});
process.on('unhandledRejection', (err) => {
    fs.appendFileSync('error.log', `[${new Date().toISOString()}] UNHANDLED: ${err?.stack || err}\n`);
});

main().catch(error => {
    fs.appendFileSync('error.log', `[${new Date().toISOString()}] FATAL: ${error.stack}\n`);
    console.error(chalk.red('Fatal error:'), error.message);
    process.exit(1);
});
