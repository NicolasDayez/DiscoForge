/**
 * DiscoForge — Vérification de code d'accès côté serveur
 * Les codes sont stockés dans les variables d'environnement Cloudflare
 * et ne sont JAMAIS exposés dans le code source côté client.
 *
 * Variables d'environnement à configurer dans Cloudflare Pages :
 *   ACCESS_CODES_PRO        = DISCO-PRO-XXXX,DISCO-PRO-YYYY
 *   ACCESS_CODES_ENTERPRISE = DISCO-ENT-XXXX,DISCO-ENT-YYYY
 *   ACCESS_CODES_STARTER    = DISCO-STR-XXXX,DISCO-STR-YYYY
 *   ACCESS_CODES_BETA       = BETA-XXXX,BETA-YYYY,BETA-ZZZZ
 */

export async function onRequestPost(context) {
  // CORS headers
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "https://discoforge.com",
    "Access-Control-Allow-Methods": "POST",
  };

  let body;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400, headers });
  }

  const code = (body.code || "").trim().toUpperCase();
  if (!code || code.length < 4) {
    return Response.json({ valid: false, plan: null }, { headers });
  }

  const env = context.env;

  // Load codes from environment variables (comma-separated)
  const proCodesRaw        = env.ACCESS_CODES_PRO        || "";
  const enterpriseCodesRaw = env.ACCESS_CODES_ENTERPRISE || "";
  const starterCodesRaw    = env.ACCESS_CODES_STARTER    || "";
  const betaCodesRaw       = env.ACCESS_CODES_BETA       || "";

  const split = raw => raw.split(",").map(c => c.trim().toUpperCase()).filter(Boolean);

  const proCodes        = split(proCodesRaw);
  const enterpriseCodes = split(enterpriseCodesRaw);
  const starterCodes    = split(starterCodesRaw);
  const betaCodes       = split(betaCodesRaw);

  let plan = null;
  let features = {};

  if (betaCodes.includes(code)) {
    plan = "beta";
    features = { titles: true, images: true, dashboard: true, unlimited: true };
  } else if (enterpriseCodes.includes(code)) {
    plan = "enterprise";
    features = { titles: true, images: true, dashboard: true, unlimited: true };
  } else if (proCodes.includes(code)) {
    plan = "pro";
    features = { titles: true, images: true, dashboard: true, unlimited: true };
  } else if (starterCodes.includes(code)) {
    plan = "starter";
    features = { titles: true, images: false, dashboard: false, unlimited: true };
  }

  if (!plan) {
    return Response.json({ valid: false, plan: null }, { headers });
  }

  return Response.json({ valid: true, plan, features }, { headers });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "https://discoforge.com",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
