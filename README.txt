VISA ONE AI — Starter Demo

Included files:
- index.html: interface structure
- style.css: responsive navy-and-gold design and animated orb
- script.js: demo chat, Arabic/English toggle, browser voice input, optional speech replies

Run locally:
1. Extract this ZIP.
2. Open the folder in Acode or another editor.
3. Preview index.html in a modern browser.
4. Allow microphone access when asked. Speech recognition availability depends on browser/device and may require HTTPS or localhost.

Voice and message behavior:
- Tap the microphone button beneath the orb (or the small composer microphone) to start voice input.
- Recognized words appear live in the message area while speaking, then are replaced by the finalized user message. The large orb microphone and the small composer microphone control the same listening session.
- The assistant's reply appears in the same message history; optional voice playback can be toggled at the bottom. Recent messages are retained for the current browser tab session (session storage).
- Voice input starts only after a user action; it does not record automatically. The orb button and composer microphone control the same listening session, and the messages area scrolls smoothly to the latest message.

Important:
This is still a front-end demo. It does not connect to Gemini, live flight prices, booking inventory, or a visa provider yet. Demo replies are not live travel advice. Do not enter sensitive personal or payment details. API keys must be stored server-side in secure environment variables, never in frontend files.
