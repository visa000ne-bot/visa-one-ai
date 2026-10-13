export default async (request) => {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };

  const send = (status, data) =>
    new Response(JSON.stringify(data), {
      status,
      headers
    });

  const token = process.env.TRAVELPAYOUTS_TOKEN;
  const marker = process.env.TRAVELPAYOUTS_MARKER || "";
  const market = process.env.TRAVELPAYOUTS_MARKET || "";

  // فحص حالة الخدمة
  if (request.method === "GET") {
    return send(200, {
      success: Boolean(token),
      service: "VISA ONE Flight Search",
      configured: Boolean(token),
      affiliateMarkerConfigured: Boolean(marker)
    });
  }

  if (request.method !== "POST") {
    return send(405, {
      success: false,
      message: "طريقة الطلب غير مدعومة."
    });
  }

  if (!token) {
    return send(500, {
      success: false,
      message: "مفتاح Travelpayouts غير مضبوط في Netlify."
    });
  }

  const validDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
      return false;
    }

    const date = new Date(value + "T00:00:00Z");

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  };

  const shiftDate = (value, days) => {
    const date = new Date(value + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const numberOrNull = (value) => {
    if (
      value === null ||
      value === undefined ||
      value === "" ||
      !Number.isFinite(Number(value))
    ) {
      return null;
    }

    return Number(value);
  };

  let input;

  try {
    input = await request.json();
  } catch {
    return send(400, {
      success: false,
      message: "تعذر قراءة تفاصيل الرحلة."
    });
  }

  const origin = String(input.from || "").trim().toUpperCase();
  const destination = String(input.to || "").trim().toUpperCase();

  const departureDate = String(input.departureDate || "");
  const returnDate = String(input.returnDate || "");

  const priority = [
    "price",
    "direct",
    "duration"
  ].includes(input.priority)
    ? input.priority
    : "price";

  const adults = Number(input.adults || 1);
  const children = Number(input.children || 0);
  const infants = Number(input.infants || 0);

  const today = new Date().toISOString().slice(0, 10);

  if (
    !/^[A-Z]{3}$/.test(origin) ||
    !/^[A-Z]{3}$/.test(destination) ||
    origin === destination
  ) {
    return send(400, {
      success: false,
      message: "تحقق من رموز مطارات المغادرة والوصول."
    });
  }

  if (
    !validDate(departureDate) ||
    departureDate < today
  ) {
    return send(400, {
      success: false,
      message: "تاريخ المغادرة غير صحيح أو أصبح في الماضي."
    });
  }

  if (
    returnDate &&
    (
      !validDate(returnDate) ||
      returnDate < departureDate
    )
  ) {
    return send(400, {
      success: false,
      message: "تاريخ العودة غير صحيح."
    });
  }

  if (
    !Number.isInteger(adults) ||
    adults < 1 ||
    adults > 9 ||
    !Number.isInteger(children) ||
    children < 0 ||
    children > 8 ||
    !Number.isInteger(infants) ||
    infants < 0 ||
    infants > adults ||
    adults + children > 9
  ) {
    return send(400, {
      success: false,
      message: "تحقق من عدد المسافرين."
    });
  }

  const offsets = [0, -1, 1, -2, 2, -3, 3];

  const dates = offsets
    .map((offset) => ({
      offset,
      departure: shiftDate(departureDate, offset),
      return: returnDate
        ? shiftDate(returnDate, offset)
        : ""
    }))
    .filter((item) =>
      item.departure >= today &&
      (!item.return || item.return >= item.departure)
    );

  const searchDate = async (item) => {
    const params = new URLSearchParams({
      origin,
      destination,
      departure_at: item.departure,
      currency: "usd",
      limit: "50",
      page: "1",
      sorting: "price",
      direct: "false",
      unique: "false",
      one_way: item.return ? "false" : "true",
      token
    });

    if (item.return) {
      params.set("return_at", item.return);
    }

    if (market) {
      params.set("market", market);
    }

    const url =
      "https://api.travelpayouts.com/aviasales/v3/prices_for_dates?" +
      params.toString();

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(12000)
      });

      let data;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok || !data || data.success === false) {
        return {
          failed: true,
          status: response.status,
          item,
          rows: []
        };
      }

      const rows = Array.isArray(data.data)
        ? data.data.filter((fare) =>
            Number(fare.price) > 0 &&
            typeof fare.link === "string" &&
            fare.link.length > 0
          )
        : [];

      return {
        failed: false,
        status: response.status,
        item,
        rows,
        currency: String(data.currency || "USD").toUpperCase()
      };
    } catch (error) {
      return {
        failed: true,
        status: error?.name === "TimeoutError" ? 504 : 0,
        item,
        rows: []
      };
    }
  };

  try {
    const exactDate = dates.find((item) => item.offset === 0);

    if (!exactDate) {
      return send(400, {
        success: false,
        message: "تعذر تجهيز تاريخ البحث."
      });
    }

    const exactResult = await searchDate(exactDate);

    if (exactResult.failed) {
      const status = exactResult.status;

      if (status === 401 || status === 403) {
        return send(502, {
          success: false,
          message: "رفضت Travelpayouts مفتاح API أو صلاحية الوصول."
        });
      }

      if (status === 429) {
        return send(503, {
          success: false,
          message: "طلبات البحث كثيرة حالياً. حاول مجدداً بعد قليل."
        });
      }

      return send(502, {
        success: false,
        message: "تعذر الاتصال بخدمة أسعار الطيران."
      });
    }

    let batches = [exactResult];

    // نبحث في تواريخ قريبة فقط إذا لم تظهر أسعار في التاريخ المطلوب
    if (exactResult.rows.length === 0) {
      const alternatives = dates.filter(
        (item) => item.offset !== 0
      );

      const results = await Promise.all(
        alternatives.map(searchDate)
      );

      batches = batches.concat(
        results.filter(
          (result) => !result.failed && result.rows.length > 0
        )
      );
    }

    const candidates = [];
    const seen = new Set();

    for (const batch of batches) {
      for (const fare of batch.rows) {
        let bookingUrl;

        try {
          const url = new URL(
            fare.link,
            "https://www.aviasales.com"
          );

          const host = url.hostname.toLowerCase();

          if (
            url.protocol !== "https:" ||
            ![
              "aviasales.com",
              "www.aviasales.com"
            ].includes(host)
          ) {
            continue;
          }

          if (marker) {
            url.searchParams.set("marker", marker);
          }

          bookingUrl = url.toString();
        } catch {
          continue;
        }

        const departureAt = String(
          fare.departure_at || batch.item.departure
        );

        const actualReturn = String(
          fare.return_at || batch.item.return || ""
        );

        const key = [
          departureAt,
          actualReturn,
          fare.price,
          fare.airline,
          fare.flight_number
        ].join("|");

        if (seen.has(key)) continue;
        seen.add(key);

        candidates.push({
          outbound: {
            from: String(fare.origin || origin).toUpperCase(),
            to: String(fare.destination || destination).toUpperCase(),
            departureAt,
            airline: String(fare.airline || ""),
            flightNumber: String(fare.flight_number || ""),
            transfers: numberOrNull(fare.transfers),
            duration: numberOrNull(fare.duration)
          },

          inbound: batch.item.return
            ? {
                from: destination,
                to: origin,
                departureAt: actualReturn || batch.item.return,
                transfers: numberOrNull(fare.return_transfers)
              }
            : null,

          totalPrice: Number(fare.price),
          currency: batch.currency || "USD",
          bookingUrl,
          requestedDepartureDate: departureDate,
          requestedReturnDate: returnDate || null,
          isAlternativeDate: batch.item.offset !== 0,
          dateOffsetDays: batch.item.offset
        });
      }
    }

    if (candidates.length === 0) {
      return send(200, {
        success: true,
        results: [],
        count: 0,
        message:
          "لم نجد سعراً مناسباً ضمن البيانات المتاحة. جرّب تاريخاً آخر."
      });
    }

    // اختيار الرحلة الأنسب وفق أولوية المسافر
    candidates.sort((a, b) => {
      if (priority === "direct") {
        const aStops =
          a.outbound.transfers ?? Number.MAX_SAFE_INTEGER;

        const bStops =
          b.outbound.transfers ?? Number.MAX_SAFE_INTEGER;

        if (aStops !== bStops) {
          return aStops - bStops;
        }
      }

      if (priority === "duration") {
        const aDuration =
          a.outbound.duration > 0
            ? a.outbound.duration
            : Number.MAX_SAFE_INTEGER;

        const bDuration =
          b.outbound.duration > 0
            ? b.outbound.duration
            : Number.MAX_SAFE_INTEGER;

        if (aDuration !== bDuration) {
          return aDuration - bDuration;
        }
      }

      return a.totalPrice - b.totalPrice;
    });

    // نعيد أفضل خيار واحد فقط
    const bestFlight = candidates[0];

    return send(200, {
      success: true,
      count: 1,
      results: [bestFlight],
      priority,
      passengers: {
        adults,
        children,
        infants
      },
      message: bestFlight.isAlternativeDate
        ? "وجدنا خياراً مناسباً على تاريخ قريب. تأكد من موعد الرحلة قبل الحجز."
        : "وجدنا الخيار الأنسب حسب أولوية البحث.",
      priceNote:
        "السعر إرشادي من بيانات Travelpayouts المخزنة مؤقتاً، وليس ضماناً للسعر النهائي أو التوفر."
    });
  } catch (error) {
    console.error("VISA ONE flight search error:", error);

    return send(500, {
      success: false,
      message: "حدث خطأ أثناء البحث عن الرحلات."
    });
  }
};
