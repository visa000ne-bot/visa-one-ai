(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const form = $("form");
  const input = $("input");
  const messages = $("messages");
  const mic = $("mic");
  const voiceToggle = $("voiceToggle");
  const orbStatus = $("orbStatus");
  const toast = $("toast");
  const orbMic = $("orbMic");
  const orbMicText = $("orbMicText");
  const orbArea = document.querySelector(".orb-area");

  if (
    !form ||
    !input ||
    !messages ||
    !mic ||
    !voiceToggle ||
    !orbStatus ||
    !toast ||
    !orbMic ||
    !orbMicText ||
    !orbArea
  ) {
    console.error("VISA ONE AI: Required HTML elements are missing.");
    return;
  }

  let en = false;
  let voice = true;
  let recognition = null;
  let listening = false;
  let toastTimer = null;
  let interimRow = null;
  let finalizingVoice = false;
  let requestInProgress = false;

  const replies = {
    ar: {
      generic: "أنا مساعد السفر الذكي من VISA ONE. كيف فيني ساعدك برحلتك اليوم؟",
      flight: "خلينا نخطط لرحلتك! من وين بدك تنطلق، لوين وجهتك، وشو تاريخ السفر وعدد المسافرين؟",
      visa: "متطلبات التأشيرة بتختلف حسب الجنسية وبلد الإقامة والوجهة والغرض من السفر. خبرني عن جنسيتك والبلد اللي بدك تزوره، وبساعدك تعرف المعلومات اللي لازم تتحقق منها.",
      idea: "أكيد! خبرني عن ميزانيتك والبلد اللي رح تنطلق منه وشو بتحب، مثل البحر أو الطبيعة أو المدن أو التسوق، وبساعدك تختار وجهة مناسبة.",
      empty: "اكتب رسالة أولاً.",
      unsupported: "المتصفح ما بيدعم الإدخال الصوتي. جرّب Chrome حديث أو اكتب رسالتك.",
      permission: "ما قدرنا نشغّل الميكروفون. تأكد من إذن الميكروفون بالمتصفح، أو استخدم الكتابة.",
      listening: "عم اسمعك… احكي هلق",
      idle: "جاهز يسمعك",
      voiceOn: "الرد الصوتي مفعّل",
      voiceOff: "الرد الصوتي متوقف",
      switched: "تم تبديل اللغة",
      thinking: "عم فكّر بطلبك…",
      connectionError: "عذراً، ما قدرت اتصل بخدمة الذكاء الاصطناعي حالياً. جرّب مرة ثانية بعد شوي.",
      busy: "لحظة، عم عالج رسالتك السابقة.",
      rateLimit: "وصلنا إلى حد الاستخدام المتاح حالياً. جرّب مرة ثانية لاحقاً.",
      unavailable: "خدمة الذكاء الاصطناعي غير متاحة حالياً. حاول مرة ثانية لاحقاً."
    },

    en: {
      generic: "I'm your VISA ONE AI travel assistant. How can I help with your trip today?",
      flight: "Let's plan your trip! Where are you departing from, where are you going, what is your travel date, and how many people are travelling?",
      visa: "Visa requirements depend on your nationality, residence, destination, and purpose of travel. Tell me your nationality and destination, and I'll help you identify what to verify.",
      idea: "Absolutely! Tell me your budget, departure country, and what you enjoy, such as beaches, nature, cities, or shopping, and I'll suggest suitable destinations.",
      empty: "Type a message first.",
      unsupported: "Voice input isn't supported here. Try a recent version of Chrome or type your message.",
      permission: "Couldn't start the microphone. Check your browser's microphone permissions, or use text input.",
      listening: "Listening… speak now",
      idle: "Ready to listen",
      voiceOn: "Voice replies on",
      voiceOff: "Voice replies off",
      switched: "Language switched",
      thinking: "Thinking...",
      connectionError: "Sorry, I couldn't connect to the AI service. Please try again shortly.",
      busy: "Please wait while I process your previous message.",
      rateLimit: "The current usage limit has been reached. Please try again later.",
      unavailable: "The AI service is currently unavailable. Please try again later."
    }
  };

  const t = key => replies[en ? "en" : "ar"][key] || key;

  function notify(message) {
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }

  function saveHistory() {
    try {
      const history = [
        ...messages.querySelectorAll(".message:not([data-static])")
      ]
        .map(row => ({
          user: row.classList.contains("user"),
          text: row.querySelector(".bubble")?.textContent || ""
        }))
        .filter(item => {
          return (
            item.text &&
            item.text !== "•••" &&
            !item.text.startsWith("عم اسمعك:") &&
            !item.text.startsWith("You're saying: ")
          );
        });

      sessionStorage.setItem(
        "visaOneAiChat",
        JSON.stringify(history.slice(-80))
      );
    } catch (error) {
      console.warn("Could not save chat history:", error);
    }
  }

  function add(content, user = false, persist = true) {
    const row = document.createElement("div");

    row.className = "message" + (user ? " user" : "");

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = user ? "Y" : "V";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = content;

    row.append(avatar, bubble);
    messages.append(row);

    messages.scrollTop = messages.scrollHeight;

    if (persist) {
      saveHistory();
    }

    return row;
  }

  function restoreHistory() {
    try {
      const history = JSON.parse(
        sessionStorage.getItem("visaOneAiChat") || "[]"
      );

      if (!Array.isArray(history) || !history.length) {
        return;
      }

      messages
        .querySelectorAll(".message:not([data-static])")
        .forEach(row => row.remove());

      history.forEach(item => {
        if (
          item &&
          typeof item.text === "string" &&
          item.text.trim()
        ) {
          add(item.text, !!item.user, false);
        }
      });

      messages.scrollTop = messages.scrollHeight;
    } catch (error) {
      console.warn("Could not restore chat history:", error);
    }
  }

  restoreHistory();

  function setOrbState(state = "") {
    orbArea.classList.remove(
      "listening",
      "thinking",
      "speaking"
    );

    if (state) {
      orbArea.classList.add(state);
    }

    const isListening = state === "listening";

    orbMic.classList.toggle("listening", isListening);
    mic.classList.toggle("listening", isListening);

    orbMic.setAttribute(
      "aria-pressed",
      String(isListening)
    );

    if (isListening) {
      orbStatus.textContent = t("listening");

      orbMicText.textContent = en
        ? "Tap to stop listening"
        : "اضغط لإيقاف الاستماع";

      orbMic.setAttribute(
        "aria-label",
        en ? "Stop listening" : "إيقاف الاستماع"
      );

      return;
    }

    orbMicText.textContent = en
      ? "Start voice conversation"
      : "ابدأ المحادثة الصوتية";

    orbMic.setAttribute(
      "aria-label",
      en ? "Start voice conversation" : "ابدأ المحادثة الصوتية"
    );

    if (state === "thinking") {
      orbStatus.textContent = t("thinking");
    } else if (state === "speaking") {
      orbStatus.textContent = en ? "Speaking…" : "عم احكي معك…";
    } else {
      orbStatus.textContent = t("idle");
    }
  }

  function speak(text) {
    if (!voice || !("speechSynthesis" in window)) {
      setOrbState("");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = en ? "en-US" : "ar-SA";
    utterance.rate = 0.96;
    utterance.pitch = 1.02;

    utterance.onstart = () => {
      setOrbState("speaking");
    };

    utterance.onend = () => {
      setOrbState("");
    };

    utterance.onerror = () => {
      setOrbState("");
    };

    window.speechSynthesis.speak(utterance);
  }

  async function replyFor(userMessage) {
    const history = [
      ...messages.querySelectorAll(".message:not([data-static])")
    ]
      .slice(-24)
      .map(row => ({
        role: row.classList.contains("user")
          ? "user"
          : "assistant",

        content: row.querySelector(".bubble")?.textContent || ""
      }))
      .filter(message => {
        return (
          message.content.trim() &&
          message.content !== "•••" &&
          !message.content.startsWith("عم اسمعك:") &&
          !message.content.startsWith("You're saying: ")
        );
      });

    // Keep the newest user message even if the history was shortened.
    if (
      !history.length ||
      history[history.length - 1].role !== "user" ||
      history[history.length - 1].content !== userMessage
    ) {
      history.push({
        role: "user",
        content: userMessage
      });
    }

    const response = await fetch(
      "/.netlify/functions/groq-chat",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          messages: history.slice(-12),
          language: en ? "en" : "ar"
        })
      }
    );

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("INVALID_RESPONSE");
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("RATE_LIMIT");
      }

      throw new Error("AI_UNAVAILABLE");
    }

    if (
      !data ||
      typeof data.reply !== "string" ||
      !data.reply.trim()
    ) {
      throw new Error("AI_UNAVAILABLE");
    }

    return data.reply.trim();
  }

  async function send(text) {
    text = (text || "").trim();

    if (!text) {
      notify(t("empty"));
      return;
    }

    if (requestInProgress) {
      notify(t("busy"));
      return;
    }

    add(text, true);
    input.value = "";

    requestInProgress = true;

    const waiting = add(t("thinking"), false, false);

    waiting.querySelector(".bubble").style.color = "#ffb51b";

    setOrbState("thinking");

    try {
      const answer = await replyFor(text);

      waiting.remove();

      add(answer);

      setOrbState("");

      speak(answer);
    } catch (error) {
      console.error("VISA ONE AI request failed:", error);

      waiting.remove();

      let message = t("connectionError");

      if (error.message === "RATE_LIMIT") {
        message = t("rateLimit");
      } else if (error.message === "AI_UNAVAILABLE") {
        message = t("unavailable");
      }

      add(message);

      setOrbState("");
    } finally {
      requestInProgress = false;
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    send(input.value);
  });

  document.querySelectorAll("[data-prompt]").forEach(button => {
    button.addEventListener("click", () => {
      const prompt = en
        ? button.dataset.enPrompt || button.dataset.prompt
        : button.dataset.prompt;

      send(prompt);
    });
  });

  function startMic() {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      notify(t("unsupported"));
      return;
    }

    const recognizer = new SpeechRecognition();

    recognition = recognizer;
    finalizingVoice = false;

    recognizer.lang = en ? "en-US" : "ar-SA";
    recognizer.interimResults = true;
    recognizer.continuous = false;

    recognizer.onstart = () => {
      listening = true;
      setOrbState("listening");
    };

    recognizer.onresult = event => {
      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript =
          event.results[i][0]?.transcript || "";

        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }

      if (interim) {
        const label = en
          ? "You're saying: "
          : "عم اسمعك: ";

        if (!interimRow) {
          interimRow = add(label + interim, true, false);
        } else {
          interimRow.querySelector(".bubble").textContent =
            label + interim;
        }

        messages.scrollTop = messages.scrollHeight;
      }

      if (finalText.trim()) {
        finalizingVoice = true;

        if (interimRow) {
          interimRow.remove();
          interimRow = null;
        }

        send(finalText.trim());
      }
    };

    recognizer.onerror = event => {
      if (
        event.error !== "no-speech" &&
        event.error !== "aborted"
      ) {
        notify(t("permission"));
      }
    };

    recognizer.onend = () => {
      listening = false;

      if (interimRow) {
        interimRow.remove();
        interimRow = null;
      }

      if (!finalizingVoice && !requestInProgress) {
        setOrbState("");
      }

      finalizingVoice = false;
      recognition = null;
    };

    try {
      recognizer.start();
    } catch (error) {
      console.error("Microphone start failed:", error);

      notify(t("permission"));

      recognition = null;
    }
  }

  function toggleMic() {
    if (listening && recognition) {
      recognition.stop();
      return;
    }

    if (requestInProgress) {
      notify(t("busy"));
      return;
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    startMic();
  }

  mic.addEventListener("click", toggleMic);
  orbMic.addEventListener("click", toggleMic);

  voiceToggle.addEventListener("click", () => {
    voice = !voice;

    voiceToggle.classList.toggle("off", !voice);

    const label = voiceToggle.querySelector("span");

    if (label) {
      label.textContent = t(voice ? "voiceOn" : "voiceOff");
    }

    if (!voice && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setOrbState("");
    }
  });

  $("langToggle")?.addEventListener("click", () => {
    en = !en;

    document.body.classList.toggle("en", en);

    document.documentElement.lang = en ? "en" : "ar";
    document.documentElement.dir = en ? "ltr" : "rtl";

    document.querySelectorAll("[data-ar][data-en]").forEach(element => {
      const value = element.dataset[en ? "en" : "ar"];

      if (element.tagName === "H1") {
        element.innerHTML = value;
      } else {
        element.textContent = value;
      }
    });

    input.placeholder = en
      ? "Type your message here..."
      : "اكتب رسالتك هون...";

    const voiceLabel = voiceToggle.querySelector("span");

    if (voiceLabel) {
      voiceLabel.textContent = t(voice ? "voiceOn" : "voiceOff");
    }

    if (listening && recognition) {
      recognition.stop();
    }

    orbMicText.textContent = en
      ? "Start voice conversation"
      : "ابدأ المحادثة الصوتية";

    notify(t("switched"));
  });

  const yearElement = $("year");

  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
})();