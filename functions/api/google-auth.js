/**
 * DiscoForge — Google OAuth Token Exchange
 * POST /api/google-auth
 *
 * Variables d'environnement Cloudflare à configurer :
 *   GOOGLE_CLIENT_ID     = votre_client_id.apps.googleusercontent.com
 *   GOOGLE_CLIENT_SECRET = votre_client_secret
 *   REDIRECT_URI         = https://discoforge.com/dashboard.html
 */

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://discoforge.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS }); }

  const { action, code, access_token, site_url, start_date, end_date } = body;

  // ── ACTION: client_id ── Expose uniquement le client_id (jamais le secret)
  if (action === "client_id") {
    return Response.json({ client_id: env.GOOGLE_CLIENT_ID || null }, { headers: CORS });
  }

  // ── ACTION: exchange ── Échange le code OAuth contre un access_token
  if (action === "exchange") {
    if (!code) return Response.json({ error: "Missing code" }, { status: 400, headers: CORS });

    const params = new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.REDIRECT_URI || "https://discoforge.com/dashboard.html",
      grant_type: "authorization_code",
    });

    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const tokenData = await tokenResp.json();
    if (!tokenResp.ok) {
      return Response.json({ error: tokenData.error_description || "Token exchange failed" }, { status: 400, headers: CORS });
    }

    return Response.json({
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
    }, { headers: CORS });
  }

  // ── ACTION: sites ── Liste les sites Search Console de l'utilisateur
  if (action === "sites") {
    if (!access_token) return Response.json({ error: "Missing token" }, { status: 401, headers: CORS });

    const resp = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const data = await resp.json();
    if (!resp.ok) return Response.json({ error: "GSC API error" }, { status: resp.status, headers: CORS });

    return Response.json({ sites: data.siteEntry || [] }, { headers: CORS });
  }

  // ── ACTION: discover ── Récupère les données Discover via Search Analytics API
  if (action === "discover") {
    if (!access_token || !site_url) return Response.json({ error: "Missing params" }, { status: 400, headers: CORS });

    const sDate = start_date || (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().split("T")[0]; })();
    const eDate = end_date || new Date().toISOString().split("T")[0];

    const payload = {
      startDate: sDate,
      endDate: eDate,
      type: "discover",
      dimensions: ["page"],
      rowLimit: 500,
      startRow: 0,
    };

    const resp = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site_url)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const data = await resp.json();
    if (!resp.ok) return Response.json({ error: data.error?.message || "GSC API error" }, { status: resp.status, headers: CORS });

    // Transforme les données en format DiscoForge
    const rows = (data.rows || []).map(r => ({
      url: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr * 100,
      position: r.position,
    }));

    return Response.json({ rows, period: { start: sDate, end: eDate } }, { headers: CORS });
  }

  return Response.json({ error: "Unknown action" }, { status: 400, headers: CORS });
}
