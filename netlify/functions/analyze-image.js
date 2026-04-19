export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Metodo no permitido", { status: 405 });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY no configurada en Netlify" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
  try {
    const body = await request.json();
    const imageBase64 = body.imageBase64;
    const imageType = body.imageType || "image/jpeg";

    const prompt = "Analiza esta imagen de una lista de repuestos automotrices. Extrae cada producto y devuelve SOLO un array JSON, sin texto adicional, sin markdown, sin explicaciones. Formato exacto: [{\"code\":\"ABC-001\",\"name\":\"nombre del producto\",\"quantity\":5,\"price\":25.50}]. Usa null si no hay codigo, cantidad o precio. Si no hay productos, devuelve [].";

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=" + apiKey;

    const geminiResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: imageType, data: imageBase64 } },
            { text: prompt }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000
        }
      })
    });

    const data = await geminiResponse.json();

    if (data.error) {
      return new Response(JSON.stringify({ error: "Error de Gemini: " + data.error.message }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    let text = "";
    try {
      text = data.candidates[0].content.parts[0].text || "";
    } catch(e) {
      return new Response(JSON.stringify({ error: "Respuesta inesperada de Gemini", raw: JSON.stringify(data).slice(0,200) }), {
        status: 422, headers: { "Content-Type": "application/json" }
      });
    }

    // Clean up the response - remove markdown, extra text
    let clean = text.trim();
    // Remove ```json ... ``` blocks
    clean = clean.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
    // Extract just the JSON array if there's surrounding text
    const arrayMatch = clean.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      clean = arrayMatch[0];
    }
    clean = clean.trim();

    let products;
    try {
      products = JSON.parse(clean);
    } catch(e) {
      return new Response(JSON.stringify({ error: "Gemini no devolvio JSON valido. Intenta con una imagen mas clara.", raw: clean.slice(0,200) }), {
        status: 422, headers: { "Content-Type": "application/json" }
      });
    }

    if (!Array.isArray(products)) products = [];

    return new Response(JSON.stringify({ products }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Error interno del servidor" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = { path: "/api/analyze-image" };
