/**
 * Startup / runtime security gates for P0 hardening.
 */

const WEAK_JWT = new Set([
  '',
  'dev-secret',
  'change-me-in-production',
  'secret',
  'jwt-secret'
]);

export function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

export function getJwtSecret() {
  return String(process.env.JWT_SECRET || '').trim();
}

let warnedJwt = false;

/** @returns {{ ok: true, secret: string } | { ok: false, message: string }} */
export function resolveJwtSecret() {
  const secret = getJwtSecret();
  const weak = !secret || WEAK_JWT.has(secret) || secret.length < 16;

  if (isProduction()) {
    if (!secret || WEAK_JWT.has(secret)) {
      return {
        ok: false,
        message:
          '生产环境必须设置强随机 JWT_SECRET（长度建议 ≥32，禁止使用 dev-secret / change-me-in-production）'
      };
    }
    if (secret.length < 32) {
      return {
        ok: false,
        message: '生产环境 JWT_SECRET 长度须 ≥ 32'
      };
    }
    return { ok: true, secret };
  }

  if (weak) {
    if (!warnedJwt) {
      warnedJwt = true;
      console.warn(
        '[security] JWT_SECRET 未配置或过弱，本地将使用临时密钥；生产部署前务必更换'
      );
    }
    return { ok: true, secret: secret && !WEAK_JWT.has(secret) ? secret : 'dev-secret-local-only' };
  }
  return { ok: true, secret };
}

/**
 * 生产环境合规变量检查：缺则告警；STRICT_SECURITY=1 时直接失败。
 */
export function checkComplianceEnv() {
  const warnings = [];
  const email = String(process.env.COMPLAINT_EMAIL || '').trim();
  const admin = String(process.env.ADMIN_TOKEN || '').trim();

  if (!email || /your-domain\.com/i.test(email)) {
    warnings.push('COMPLAINT_EMAIL 未配置或仍为占位邮箱');
  }
  if (!admin || admin.length < 16) {
    warnings.push('ADMIN_TOKEN 未配置或过短（建议 ≥16 随机串）');
  }

  if (!warnings.length) return { ok: true, warnings: [] };

  for (const w of warnings) console.warn('[security]', w);

  if (isProduction() && String(process.env.STRICT_SECURITY || '') === '1') {
    return {
      ok: false,
      message: `STRICT_SECURITY=1：${warnings.join('；')}`,
      warnings
    };
  }
  return { ok: true, warnings };
}

/** 演示支付：生产默认关闭；本地默认开启。可用 ENABLE_DEMO_PAY=0/1 覆盖 */
export function isDemoPayEnabled() {
  const raw = process.env.ENABLE_DEMO_PAY;
  if (raw !== undefined && String(raw).trim() !== '') {
    return /^(1|true|yes|on)$/i.test(String(raw).trim());
  }
  return !isProduction();
}

export function getDailyGenerateLimit() {
  const n = Number(process.env.DAILY_GENERATE_LIMIT);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 10;
}

/** 启动时调用；失败则 process.exit(1) */
export function assertSecurityOnBoot() {
  const jwt = resolveJwtSecret();
  if (!jwt.ok) {
    console.error('[security] FATAL:', jwt.message);
    process.exit(1);
  }
  // 回写，供 auth 使用统一密钥
  process.env.JWT_SECRET = jwt.secret;

  const compliance = checkComplianceEnv();
  if (!compliance.ok) {
    console.error('[security] FATAL:', compliance.message);
    process.exit(1);
  }

  console.log(
    '[security] demoPay=',
    isDemoPayEnabled() ? 'on' : 'off',
    'dailyGenerateLimit=',
    getDailyGenerateLimit()
  );
}
