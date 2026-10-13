export default async (request) => {
const headers = {
"Content-Type": "application/json"
};

if (request.method !== "POST") {
return new Response(
JSON.stringify({ error: "Method not allowed" }),
{ status: 405, headers }
);
}

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
return new Response(
JSON.stringify({ error: "API key is not configured" }),
{ status: 500, headers }
);
}

try {
const body = await request.json();
const messages = body.messages;

if (!Array.isArray(messages) || messages.length === 0) {
  return new Response(
    JSON.stringify({ error: "Messages are required" }),
    { status: 400, headers }
  );
}

const safeMessages = messages
  .filter(
    (message) =>
      ["user", "assistant"].includes(message.role) &&
      typeof message.content === "string"
  )
  .slice(-12)
  .map((message) => ({
    role: message.role,
    content: message.content.slice(0, 4000)
  }));

if (!safeMessages.length) {
  return new Response(
    JSON.stringify({ error: "No valid messages" }),
    { status: 400, headers }
  );
}

const response = await fetch(
  "https://api.groq.com/openai/v1/chat/completions",
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "أنت مساعد سفر ذكي وودود. أجب باللغة العربية المناسبة للعميل، وساعده في فهم الوجهات والتأشيرات والرحلات والفنادق. لا تؤكد شروط التأشيرات أو الأسعار أو الحجوزات دون معلومات موثوقة وحديثة. وضّح عندما تحتاج إلى التحقق من المعلومات."
        },
        ...safeMessages
      ],
      temperature: 0.7,
      max_tokens: 700
    })
  }
);

const data = await response.json();

if (!response.ok) {
  console.error("Groq API error:", response.status, data);

  return new Response(
    JSON.stringify({
      error: "تعذر الحصول على رد من الذكاء الاصطناعي حالياً."
    }),
    { status: 502, headers }
  );
}

const reply = data.choices?.[0]?.message?.content;

if (!reply) {
  return new Response(
    JSON.stringify({ error: "Empty AI response" }),
    { status: 502, headers }
  );
}

return new Response(
  JSON.stringify({ reply }),
  { status: 200, headers }
);

} catch (error) {
console.error("Chat function error:", error);

return new Response(
  JSON.stringify({ error: "حدث خطأ أثناء معالجة الرسالة." }),
  { status: 500, headers }
);

}
};
