/**
 * DiscoForge — Gestion des accès Bêta
 * POST /api/beta-access
 *
 * Requiert un KV namespace "BETA_TOKENS" lié dans Cloudflare Pages :
 *   Pages → Settings → Functions → KV namespace bindings → BETA_TOKENS
 *
 * Format d'un token dans KV :
 *   key   : "beta_TOKENVALUE"
 *   value : JSON { email, created_at, expires_at, used, name }
 *
 * Pour créer un token (via wrangler ou l'interface Cloudflare) :
 *   wrangler kv:key put --binding=BETA_TOKENS "beta_MONTOKEN" '{"email":"client@media.fr","name":"Jean Dupont","created_at":1710000000000,"expires_at":1710604800000,"used":false}'
 */

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://discoforge.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.BETA_TOKENS) {
    return Response.json({ error: "KV not configured" }, { status: 500, headers: CORS_HEADERS });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS }); }

  const { token, email, action } = body;

  // ── ACTION: verify ──
  // Vérifie qu'un token est valide pour un email donné
  if (action === "verify") {
    if (!token || !email) {
      return Response.json({ valid: false, reason: "missing_fields" }, { headers: CORS_HEADERS });
    }

    const key = "beta_" + token.trim().toUpperCase();
    const raw = await env.BETA_TOKENS.get(key);

    if (!raw) {
      return Response.json({ valid: false, reason: "invalid_token" }, { headers: CORS_HEADERS });
    }

    let data;
    try { data = JSON.parse(raw); }
    catch { return Response.json({ valid: false, reason: "corrupt_data" }, { headers: CORS_HEADERS }); }

    // Vérifie l'email (insensible à la casse)
    if (data.email.toLowerCase() !== email.trim().toLowerCase()) {
      return Response.json({ valid: false, reason: "email_mismatch" }, { headers: CORS_HEADERS });
    }

    // Vérifie l'expiration
    const now = Date.now();
    if (now > data.expires_at) {
      return Response.json({ valid: false, reason: "expired", expired_at: data.expires_at }, { headers: CORS_HEADERS });
    }

    // Marque comme utilisé (première fois)
    if (!data.used) {
      data.used = true;
      data.first_used_at = now;
      await env.BETA_TOKENS.put(key, JSON.stringify(data), {
        expiration: Math.floor(data.expires_at / 1000) + 86400 // expire 1 jour après la fin du bêta
      });
    }

    const daysLeft = Math.ceil((data.expires_at - now) / (1000 * 60 * 60 * 24));

    return Response.json({
      valid: true,
      plan: "beta",
      name: data.name || "",
      email: data.email,
      expires_at: data.expires_at,
      days_left: daysLeft,
      features: { titles: true, images: true, dashboard: true, unlimited: true }
    }, { headers: CORS_HEADERS });
  }

  // ── ACTION: create (admin uniquement) ──
  // Crée un nouveau token bêta. Protégé par ADMIN_SECRET.
  if (action === "create") {
    const adminSecret = env.ADMIN_SECRET;
    if (!adminSecret || body.secret !== adminSecret) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }

    if (!email) {
      return Response.json({ error: "email required" }, { status: 400, headers: CORS_HEADERS });
    }

    // Génère un token aléatoire
    const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const newToken = "BETA-" + randomPart;

    const now = Date.now();
    const days = parseInt(body.days || 7);
    const expiresAt = now + days * 24 * 60 * 60 * 1000;

    const tokenData = {
      email: email.trim().toLowerCase(),
      name: body.name || "",
      created_at: now,
      expires_at: expiresAt,
      days: days,
      used: false,
    };

    await env.BETA_TOKENS.put(
      "beta_" + newToken,
      JSON.stringify(tokenData),
      { expiration: Math.floor(expiresAt / 1000) + 86400 }
    );

    const betaUrl = "https://discoforge.com/beta.html?token=" + newToken;

    return Response.json({
      success: true,
      token: newToken,
      email: tokenData.email,
      expires_at: expiresAt,
      days: days,
      url: betaUrl,
    }, { headers: CORS_HEADERS });
  }

  return Response.json({ error: "Unknown action" }, { status: 400, headers: CORS_HEADERS });
}
