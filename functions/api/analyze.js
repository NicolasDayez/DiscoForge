export async function onRequestPost(context) {
  const apiKey = context.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "Clé API manquante" }, { status: 500 });

  const body = await context.request.json();
  const titles = (body.titles || []).map(t => t.trim()).filter(Boolean).slice(0, 5);
  if (!titles.length) return Response.json({ error: "Aucun titre" }, { status: 400 });

  const results = [];
  for (const title of titles) {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          temperature: 0,
          messages: [{ role: "user", content: body.prompt + `\n\nTITRE: "${title}"` }]
        })
      });
      const msg = await resp.json();
      results.push({ title, raw: msg.content[0].text });
    } catch(e) {
      results.push({ title, error: e.message });
    }
  }
  return Response.json({ results });
}
