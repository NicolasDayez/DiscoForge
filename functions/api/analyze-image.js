export async function onRequestPost(context) {
  const apiKey = context.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "Clé API manquante" }, { status: 500 });

  const body = await context.request.json();
  if (!body.image_b64 || !body.media_type) return Response.json({ error: "Image manquante" }, { status: 400 });

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
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: body.media_type,
              data: body.image_b64
            }
          },
          { type: "text", text: body.prompt }
        ]
      }]
    })
  });

  const msg = await resp.json();
  return Response.json({ raw: msg.content[0].text });
}
