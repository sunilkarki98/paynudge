"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/lib/logger.ts
function formatMessage(level, message, context) {
  if (IS_PRODUCTION) {
    return JSON.stringify({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      message,
      ...context
    });
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[1]?.replace("Z", "") ?? "";
  const prefix = `[${timestamp}] [${level.toUpperCase().padEnd(5)}]`;
  const ctxStr = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";
  return `${prefix} ${message}${ctxStr}`;
}
function shouldLog(level) {
  return LOG_LEVELS[level] >= MIN_LEVEL;
}
var LOG_LEVELS, MIN_LEVEL, IS_PRODUCTION, logger;
var init_logger = __esm({
  "src/lib/logger.ts"() {
    "use strict";
    LOG_LEVELS = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    MIN_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || "info"];
    IS_PRODUCTION = process.env.NODE_ENV === "production";
    logger = {
      debug(message, context) {
        if (shouldLog("debug")) console.debug(formatMessage("debug", message, context));
      },
      info(message, context) {
        if (shouldLog("info")) console.info(formatMessage("info", message, context));
      },
      warn(message, context) {
        if (shouldLog("warn")) console.warn(formatMessage("warn", message, context));
      },
      error(message, context) {
        if (shouldLog("error")) console.error(formatMessage("error", message, context));
      },
      /** Create a child logger with default context fields */
      child(defaultContext) {
        return {
          debug: (msg, ctx) => logger.debug(msg, { ...defaultContext, ...ctx }),
          info: (msg, ctx) => logger.info(msg, { ...defaultContext, ...ctx }),
          warn: (msg, ctx) => logger.warn(msg, { ...defaultContext, ...ctx }),
          error: (msg, ctx) => logger.error(msg, { ...defaultContext, ...ctx })
        };
      }
    };
  }
});

// src/infrastructure/redis.ts
function getRedisConnection() {
  if (redisInstance) return redisInstance;
  const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  redisInstance = new import_ioredis.default(redisUrl, {
    maxRetriesPerRequest: null,
    // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5e3);
      log.warn("Redis connection retry", { attempt: times, delayMs: delay });
      return delay;
    },
    reconnectOnError(err) {
      const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
      return targetErrors.some((e) => err.message.includes(e));
    }
  });
  redisInstance.on("connect", () => {
    log.info("Redis connected");
  });
  redisInstance.on("error", (err) => {
    log.error("Redis connection error", { error: err.message });
  });
  redisInstance.on("close", () => {
    log.warn("Redis connection closed");
  });
  return redisInstance;
}
function createRedisConnection() {
  const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  return new import_ioredis.default(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5e3);
      return delay;
    }
  });
}
async function disconnectRedis() {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
    log.info("Redis disconnected gracefully");
  }
}
var import_ioredis, log, redisInstance;
var init_redis = __esm({
  "src/infrastructure/redis.ts"() {
    "use strict";
    import_ioredis = __toESM(require("ioredis"));
    init_logger();
    log = logger.child({ module: "redis" });
    redisInstance = null;
  }
});

// src/modules/queues/queue-names.ts
var QUEUE_NAMES;
var init_queue_names = __esm({
  "src/modules/queues/queue-names.ts"() {
    "use strict";
    QUEUE_NAMES = {
      EMAIL: "invoice-chaser-email",
      WHATSAPP: "invoice-chaser-whatsapp",
      SMS: "invoice-chaser-sms",
      OVERDUE_CHECK: "invoice-chaser-overdue-check",
      DEAD_LETTER: "invoice-dead-letter"
    };
  }
});

// src/lib/prisma.ts
function createPrismaClient() {
  const pool = new import_pg.default.Pool({
    connectionString: process.env.DATABASE_URL
  });
  const adapter = new import_adapter_pg.PrismaPg(pool);
  return new import_client.PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query"] : []
  });
}
var import_client, import_adapter_pg, import_pg, globalForPrisma, prisma;
var init_prisma = __esm({
  "src/lib/prisma.ts"() {
    "use strict";
    import_client = require("@prisma/client");
    import_adapter_pg = require("@prisma/adapter-pg");
    import_pg = __toESM(require("pg"));
    globalForPrisma = globalThis;
    prisma = globalForPrisma.prisma ?? createPrismaClient();
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
  }
});

// src/modules/events/event-bus.ts
var event_bus_exports = {};
__export(event_bus_exports, {
  eventBus: () => eventBus
});
var import_events, log2, TypedEventBus, eventBus;
var init_event_bus = __esm({
  "src/modules/events/event-bus.ts"() {
    "use strict";
    import_events = require("events");
    init_logger();
    log2 = logger.child({ module: "event-bus" });
    TypedEventBus = class {
      emitter;
      constructor() {
        this.emitter = new import_events.EventEmitter();
        this.emitter.setMaxListeners(50);
      }
      /**
       * Emit an event with a typed payload.
       * All registered handlers execute asynchronously (fire-and-forget).
       * Errors in handlers are caught and logged — they never crash the emitter.
       */
      emit(event, payload) {
        log2.info("Event emitted", {
          event,
          invoiceId: "invoiceId" in payload ? payload.invoiceId : void 0
        });
        this.emitter.emit(event, payload);
      }
      /**
       * Subscribe to an event with a typed handler.
       * Handlers are wrapped with error catching to prevent unhandled rejections.
       */
      on(event, handler) {
        this.emitter.on(event, async (payload) => {
          try {
            await handler(payload);
          } catch (err) {
            log2.error("Event handler error", {
              event,
              error: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : void 0
            });
          }
        });
        log2.info("Event handler registered", { event });
      }
      /**
       * Remove all listeners for an event (useful for testing).
       */
      removeAllListeners(event) {
        if (event) {
          this.emitter.removeAllListeners(event);
        } else {
          this.emitter.removeAllListeners();
        }
      }
    };
    eventBus = new TypedEventBus();
  }
});

// src/lib/settings.ts
async function getSetting(key, defaultValue = "") {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const setting = await prisma.systemSetting.findUnique({
    where: { key }
  });
  const valueToUse = setting?.value || process.env[key] || defaultValue;
  cache.set(key, {
    value: valueToUse,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
  return valueToUse;
}
var cache, CACHE_TTL_MS;
var init_settings = __esm({
  "src/lib/settings.ts"() {
    "use strict";
    init_prisma();
    cache = /* @__PURE__ */ new Map();
    CACHE_TTL_MS = 60 * 1e3;
  }
});

// src/modules/ai/message-generator.ts
var message_generator_exports = {};
__export(message_generator_exports, {
  generateMessage: () => generateMessage
});
async function getGenAI() {
  const apiKey = await getSetting("GEMINI_API_KEY");
  if (!apiKey) {
    log4.warn("GEMINI_API_KEY not set \u2014 falling back to template-based messages");
    return null;
  }
  return new import_generative_ai.GoogleGenerativeAI(apiKey);
}
async function generateMessage(ctx) {
  const ai = await getGenAI();
  if (ai) {
    try {
      return await generateWithLLM(ai, ctx);
    } catch (err) {
      log4.error("LLM message generation failed, falling back to templates", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return generateWithTemplate(ctx);
}
async function generateWithLLM(ai, ctx) {
  const generatorModel = await getSetting("GEMINI_GENERATOR_MODEL", "gemini-2.0-flash");
  const model = ai.getGenerativeModel({ model: generatorModel });
  const toneInstructions = {
    FRIENDLY: "warm, casual, empathetic. Use conversational language. Assume good intent. Brief use of emoji is ok.",
    PROFESSIONAL: "formal, polite, direct. Business-like and respectful. No emoji. Clear and concise.",
    FIRM: "direct, serious, urgent. Mention potential consequences professionally. Still respectful but leave no ambiguity about urgency."
  };
  const stageContext = ctx.daysOverdue && ctx.daysOverdue > 0 ? `The invoice is ${ctx.daysOverdue} days overdue.` : "The invoice is due today or coming up soon.";
  const prompt = `You are writing a payment reminder email for a freelancer's invoicing system.

CONTEXT:
- Client name: ${ctx.clientName}
- Invoice: ${ctx.invoiceNumber || "N/A"}
- Amount: $${ctx.amount.toLocaleString()}
- Due date: ${ctx.dueDate}
- ${stageContext}
- This is reminder stage ${ctx.stage} of the escalation sequence.
- Sender: ${ctx.senderName || "the freelancer"}
${ctx.paymentLink ? `- Payment link: ${ctx.paymentLink}` : ""}

TONE: ${ctx.tone} \u2014 ${toneInstructions[ctx.tone]}

RULES:
1. Keep it SHORT (3-5 sentences max for the body)
2. Do NOT be aggressive, threatening, or spammy
3. Do NOT use legal threats or collection agency language
4. Include the invoice amount and due date naturally
5. If a payment link is provided, mention it as a convenient way to pay
6. End with a professional sign-off line
7. Do NOT include "Dear" or overly formal greetings \u2014 use "Hi {name}" or "Hello {name}"
8. The email must work standalone without any attachments

Respond in this exact JSON format (no markdown, no code blocks, just raw JSON):
{
  "subject": "Email subject line",
  "body": "Plain text email body (just the message, no subject)",
  "sms": "SMS version in under 155 characters"
}`;
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  let cleaned = text;
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/```\s*$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "");
  }
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    log4.warn("Failed to parse LLM JSON response, falling back to template", { raw: text });
    return generateWithTemplate(ctx);
  }
  if (!parsed.subject || !parsed.body) {
    log4.warn("LLM returned incomplete response, falling back to template");
    return generateWithTemplate(ctx);
  }
  const htmlBody = buildEmailHtml(parsed.subject, parsed.body, ctx);
  log4.info("LLM message generated", {
    tone: ctx.tone,
    stage: ctx.stage,
    clientName: ctx.clientName
  });
  return {
    subject: parsed.subject,
    htmlBody,
    plainText: parsed.body,
    smsText: parsed.sms || void 0,
    source: "llm"
  };
}
function generateWithTemplate(ctx) {
  const templates = getTemplateForStage(ctx.stage, ctx.tone);
  const vars = {
    "{{clientName}}": ctx.clientName,
    "{{amount}}": `$${ctx.amount.toLocaleString()}`,
    "{{dueDate}}": new Date(ctx.dueDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }),
    "{{daysOverdue}}": String(ctx.daysOverdue || 0),
    "{{invoiceNumber}}": ctx.invoiceNumber || `#${Date.now().toString(36).toUpperCase()}`,
    "{{paymentLink}}": ctx.paymentLink || "",
    "{{senderName}}": ctx.senderName || "Invoice Chaser"
  };
  let subject = templates.subject;
  let body = templates.body;
  let sms = templates.sms;
  for (const [key, value] of Object.entries(vars)) {
    subject = subject.replaceAll(key, value);
    body = body.replaceAll(key, value);
    sms = sms.replaceAll(key, value);
  }
  if (!ctx.paymentLink) {
    body = body.replace(/You can pay quickly[^.]*\./g, "");
    body = body.replace(/Pay now:.*\n?/g, "");
  }
  const htmlBody = buildEmailHtml(subject, body, ctx);
  return {
    subject,
    htmlBody,
    plainText: body,
    smsText: sms.length <= 160 ? sms : sms.substring(0, 157) + "...",
    source: "template"
  };
}
function getTemplateForStage(stage, tone) {
  const templates = {
    FRIENDLY: {
      1: {
        subject: "Friendly reminder \u2014 Invoice {{invoiceNumber}} is due today",
        body: `Hi {{clientName}},

Just a quick heads-up that invoice {{invoiceNumber}} for {{amount}} is due today ({{dueDate}}). No rush\u2014just wanted to make sure it didn't slip through the cracks! \u{1F60A}

You can pay quickly here: {{paymentLink}}

Thanks so much!`,
        sms: "Hi {{clientName}}! Reminder: Invoice {{invoiceNumber}} ({{amount}}) is due today. Thanks!"
      },
      2: {
        subject: "Checking in \u2014 Invoice {{invoiceNumber}} is {{daysOverdue}} days past due",
        body: `Hi {{clientName}},

Hope you're doing well! I noticed invoice {{invoiceNumber}} for {{amount}} is now {{daysOverdue}} days past due. Totally understand if it slipped by \u2014 happens to all of us!

You can pay quickly here: {{paymentLink}}

Would love to get this sorted. Let me know if you have any questions!`,
        sms: "Hi {{clientName}}, just checking in \u2014 invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days past due. Let me know!"
      },
      3: {
        subject: "Following up \u2014 Invoice {{invoiceNumber}} is now {{daysOverdue}} days overdue",
        body: `Hi {{clientName}},

I wanted to follow up on invoice {{invoiceNumber}} for {{amount}} which was due on {{dueDate}} \u2014 it's now {{daysOverdue}} days overdue. I'd really appreciate it if you could look into this when you get a chance.

You can pay quickly here: {{paymentLink}}

If there's an issue, please let me know so we can work it out together!`,
        sms: "Hi {{clientName}}, invoice {{invoiceNumber}} ({{amount}}) is now {{daysOverdue}} days overdue. Please let me know the status."
      },
      4: {
        subject: "Final reminder \u2014 Invoice {{invoiceNumber}} requires your attention",
        body: `Hi {{clientName}},

This is my final reminder about invoice {{invoiceNumber}} for {{amount}}, which is now {{daysOverdue}} days past due since {{dueDate}}. I really need to get this resolved.

You can pay quickly here: {{paymentLink}}

Please let me know how you'd like to proceed. I value our working relationship and want to sort this out.`,
        sms: "Final reminder: Invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days overdue. Please arrange payment. Thanks."
      }
    },
    PROFESSIONAL: {
      1: {
        subject: "Payment Reminder \u2014 Invoice {{invoiceNumber}}",
        body: `Hello {{clientName}},

This is a reminder that invoice {{invoiceNumber}} for {{amount}} is due today, {{dueDate}}. We would appreciate prompt payment at your earliest convenience.

You can pay quickly here: {{paymentLink}}

Thank you for your attention to this matter.`,
        sms: "Reminder: Invoice {{invoiceNumber}} ({{amount}}) is due today. Please arrange payment. Thank you."
      },
      2: {
        subject: "Payment Follow-Up \u2014 Invoice {{invoiceNumber}}",
        body: `Hello {{clientName}},

We would like to bring to your attention that invoice {{invoiceNumber}} for {{amount}} is now {{daysOverdue}} days past the due date of {{dueDate}}.

You can pay quickly here: {{paymentLink}}

If payment has already been made, please disregard this notice. Otherwise, we kindly request that you arrange payment at your earliest convenience.`,
        sms: "Invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days past due. Please arrange payment."
      },
      3: {
        subject: "Urgent: Payment Overdue \u2014 Invoice {{invoiceNumber}}",
        body: `Dear {{clientName}},

This is an important notice regarding invoice {{invoiceNumber}} for {{amount}}, which is now {{daysOverdue}} days overdue since {{dueDate}}. We kindly request immediate payment to avoid any disruption to our services.

You can pay quickly here: {{paymentLink}}

If there are any concerns regarding this payment, please contact us immediately so we can work together to resolve them.`,
        sms: "Urgent: Invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days overdue. Immediate payment requested."
      },
      4: {
        subject: "Final Notice: Payment Required \u2014 Invoice {{invoiceNumber}}",
        body: `Dear {{clientName}},

This is our final notice regarding invoice {{invoiceNumber}} for {{amount}}, which has been outstanding for {{daysOverdue}} days since the due date of {{dueDate}}. Immediate payment is required.

You can pay quickly here: {{paymentLink}}

Please arrange payment immediately or provide confirmation if payment has already been made. Failure to respond may necessitate additional measures.`,
        sms: "FINAL NOTICE: Invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days overdue. Immediate payment required."
      }
    },
    FIRM: {
      1: {
        subject: "Payment Due Today \u2014 Invoice {{invoiceNumber}}",
        body: `{{clientName}},

Invoice {{invoiceNumber}} for {{amount}} is due today, {{dueDate}}. Please ensure payment is processed today.

Pay now: {{paymentLink}}

Thank you.`,
        sms: "Invoice {{invoiceNumber}} ({{amount}}) due today. Please pay promptly."
      },
      2: {
        subject: "Overdue Payment \u2014 Invoice {{invoiceNumber}} ({{daysOverdue}} Days)",
        body: `{{clientName}},

Invoice {{invoiceNumber}} for {{amount}} is now {{daysOverdue}} days overdue. This payment was due on {{dueDate}} and requires your immediate attention.

Pay now: {{paymentLink}}

Please arrange payment today.`,
        sms: "Invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days overdue. Immediate payment needed."
      },
      3: {
        subject: "URGENT: Overdue Invoice {{invoiceNumber}} \u2014 {{daysOverdue}} Days Outstanding",
        body: `{{clientName}},

Invoice {{invoiceNumber}} for {{amount}} has been outstanding for {{daysOverdue}} days. Despite previous reminders, payment has not been received. This matter requires your urgent attention.

Pay now: {{paymentLink}}

Please process this payment immediately or contact us to discuss the situation. Continued non-payment may result in suspension of services.`,
        sms: "URGENT: Invoice {{invoiceNumber}} ({{amount}}) {{daysOverdue}} days overdue. Pay now or contact us immediately."
      },
      4: {
        subject: "FINAL NOTICE \u2014 Invoice {{invoiceNumber}} ({{daysOverdue}} Days Overdue)",
        body: `{{clientName}},

This is our FINAL notice regarding invoice {{invoiceNumber}} for {{amount}}, now {{daysOverdue}} days past the due date of {{dueDate}}.

Pay now: {{paymentLink}}

If payment is not received within 48 hours, we will be forced to take further action, which may include suspension of ongoing work and formal collection proceedings. Please treat this as a matter of urgency.`,
        sms: "FINAL NOTICE: Invoice {{invoiceNumber}} ({{amount}}) {{daysOverdue}}d overdue. Payment required within 48hrs."
      }
    }
  };
  const effectiveStage = Math.min(stage, 4);
  return templates[tone][effectiveStage] || templates.PROFESSIONAL[effectiveStage];
}
function buildEmailHtml(title, plainBody, ctx) {
  const accentColors = {
    1: "#06b6d4,#0891b2",
    // Cyan
    2: "#eab308,#ca8a04",
    // Yellow
    3: "#f97316,#ea580c",
    // Orange
    4: "#ef4444,#dc2626"
    // Red
  };
  const accent = accentColors[Math.min(ctx.stage, 4)] || accentColors[1];
  const htmlParagraphs = plainBody.split("\n\n").filter((p) => p.trim()).map((p) => `<p style="color:#cbd5e1;line-height:1.6;font-size:15px;margin:0 0 16px;">${escapeHtml(p.trim())}</p>`).join("");
  const paymentButton = ctx.paymentLink ? `<div style="margin:24px 0;text-align:center;">
        <a href="${escapeHtml(ctx.paymentLink)}" style="background:linear-gradient(90deg,#06b6d4,#8b5cf6);color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;display:inline-block;font-size:16px;">\u{1F4B3} Pay Now \u2014 $${ctx.amount.toLocaleString()}</a>
      </div>` : "";
  const invoiceId = ctx.invoiceNumber || "N/A";
  const detailsCard = `
    <div style="background:#1e293b;border-radius:12px;padding:20px;margin:20px 0;border:1px solid #334155;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="color:#94a3b8;padding:8px 0;font-size:14px;">Invoice</td>
          <td style="color:#f1f5f9;padding:8px 0;text-align:right;font-size:14px;font-weight:600;">${escapeHtml(invoiceId)}</td>
        </tr>
        <tr>
          <td style="color:#94a3b8;padding:8px 0;font-size:14px;">Amount Due</td>
          <td style="color:#22d3ee;padding:8px 0;text-align:right;font-size:14px;font-weight:600;">$${ctx.amount.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="color:#94a3b8;padding:8px 0;font-size:14px;">Due Date</td>
          <td style="color:#f1f5f9;padding:8px 0;text-align:right;font-size:14px;font-weight:600;">${escapeHtml(new Date(ctx.dueDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }))}</td>
        </tr>
      </table>
    </div>`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border-radius:16px;overflow:hidden;border:1px solid #334155;">
      <div style="background:linear-gradient(90deg,${accent});padding:24px 32px;">
        <h1 style="color:#fff;margin:0;font-size:20px;font-weight:600;">\u26A1 Invoice Chaser</h1>
      </div>
      <div style="padding:32px;">
        ${htmlParagraphs}
        ${detailsCard}
        ${paymentButton}
      </div>
      <div style="padding:16px 32px;border-top:1px solid #334155;">
        <p style="color:#64748b;font-size:12px;margin:0;">This is an automated reminder from Invoice Chaser.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
function escapeHtml(unsafe) {
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
var import_generative_ai, log4;
var init_message_generator = __esm({
  "src/modules/ai/message-generator.ts"() {
    "use strict";
    import_generative_ai = require("@google/generative-ai");
    init_settings();
    init_logger();
    log4 = logger.child({ module: "message-generator" });
  }
});

// src/lib/encryption.ts
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 64) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY must be a 64-character hex string in production");
    }
    log5.warn("Using weak ENCRYPTION_KEY \u2014 set a strong key before deploying");
    return (0, import_crypto.scryptSync)("dev-only-insecure-encryption-key", "salt", 32);
  }
  return Buffer.from(key, "hex");
}
function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = (0, import_crypto.randomBytes)(IV_LENGTH);
  const cipher = (0, import_crypto.createCipheriv)(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString("base64");
}
function decrypt(encryptedBase64) {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);
  const decipher = (0, import_crypto.createDecipheriv)(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}
var import_crypto, log5, ALGORITHM, IV_LENGTH, TAG_LENGTH;
var init_encryption = __esm({
  "src/lib/encryption.ts"() {
    "use strict";
    import_crypto = require("crypto");
    init_logger();
    log5 = logger.child({ module: "encryption" });
    ALGORITHM = "aes-256-gcm";
    IV_LENGTH = 16;
    TAG_LENGTH = 16;
  }
});

// src/modules/communication/google-oauth.ts
function getOAuth2Client() {
  return new import_googleapis.google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}
async function getGmailClient(userId) {
  const credential = await prisma.userCredential.findUnique({
    where: { userId_provider: { userId, provider: "google_oauth" } }
  });
  if (!credential) return null;
  const client = getOAuth2Client();
  const accessToken = decrypt(credential.accessToken);
  const refreshToken = credential.refreshToken ? decrypt(credential.refreshToken) : void 0;
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: credential.tokenExpiry?.getTime()
  });
  client.on("tokens", async (newTokens) => {
    try {
      const updateData = {
        updatedAt: /* @__PURE__ */ new Date()
      };
      if (newTokens.access_token) {
        updateData.accessToken = encrypt(newTokens.access_token);
      }
      if (newTokens.refresh_token) {
        updateData.refreshToken = encrypt(newTokens.refresh_token);
      }
      if (newTokens.expiry_date) {
        updateData.tokenExpiry = new Date(newTokens.expiry_date);
      }
      await prisma.userCredential.update({
        where: { userId_provider: { userId, provider: "google_oauth" } },
        data: updateData
      });
      log6.info("Google OAuth tokens refreshed", { userId });
    } catch (err) {
      log6.error("Failed to save refreshed tokens", {
        userId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  return import_googleapis.google.gmail({ version: "v1", auth: client });
}
async function sendViaGmail(userId, to, subject, htmlBody, fromEmail) {
  const gmail = await getGmailClient(userId);
  if (!gmail) return false;
  const credential = await prisma.userCredential.findUnique({
    where: { userId_provider: { userId, provider: "google_oauth" } }
  });
  const senderEmail = fromEmail || credential?.metadata?.email || "";
  const messageParts = [
    `From: ${senderEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    htmlBody
  ];
  const rawMessage = Buffer.from(messageParts.join("\r\n")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  try {
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawMessage }
    });
    log6.info("Email sent via Gmail", { userId, to, subject });
    return true;
  } catch (err) {
    log6.error("Gmail send failed", {
      userId,
      to,
      error: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
}
async function isGoogleConnected(userId) {
  const credential = await prisma.userCredential.findUnique({
    where: { userId_provider: { userId, provider: "google_oauth" } }
  });
  if (!credential) return { connected: false };
  const metadata = credential.metadata;
  return {
    connected: true,
    email: metadata?.email
  };
}
var import_googleapis, log6;
var init_google_oauth = __esm({
  "src/modules/communication/google-oauth.ts"() {
    "use strict";
    import_googleapis = require("googleapis");
    init_prisma();
    init_encryption();
    init_logger();
    log6 = logger.child({ module: "google-oauth" });
  }
});

// src/modules/communication/email-sender.ts
var email_sender_exports = {};
__export(email_sender_exports, {
  sendEmail: () => sendEmail
});
async function sendEmail(options) {
  const { userId, to, subject, htmlBody, trackingPixelUrl } = options;
  let finalHtml = htmlBody;
  if (trackingPixelUrl) {
    finalHtml = injectTrackingPixel(htmlBody, trackingPixelUrl);
  }
  const googleStatus = await isGoogleConnected(userId);
  if (googleStatus.connected) {
    try {
      const success = await sendViaGmail(userId, to, subject, finalHtml);
      if (success) {
        log7.info("Email sent via Gmail", { userId, to, subject });
        return { success: true, channel: "gmail" };
      }
    } catch (err) {
      log7.warn("Gmail send failed, falling back to SMTP", {
        userId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  try {
    await sendViaSMTP(to, subject, finalHtml, options.plainText);
    log7.info("Email sent via SMTP", { userId, to, subject });
    return { success: true, channel: "smtp" };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log7.error("SMTP send failed", { userId, to, error: errorMsg });
    return { success: false, channel: "smtp", error: errorMsg };
  }
}
function getTransporter() {
  if (transporter) return transporter;
  transporter = import_nodemailer.default.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return transporter;
}
async function sendViaSMTP(to, subject, htmlBody, plainText) {
  const transport = getTransporter();
  await transport.sendMail({
    from: process.env.SMTP_FROM || '"Invoice Chaser" <noreply@invoicechaser.com>',
    to,
    subject,
    html: htmlBody,
    text: plainText
  });
}
function injectTrackingPixel(html, pixelUrl) {
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;border:0;" alt="" />`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${pixel}</body>`);
  }
  return html + pixel;
}
var import_nodemailer, log7, transporter;
var init_email_sender = __esm({
  "src/modules/communication/email-sender.ts"() {
    "use strict";
    import_nodemailer = __toESM(require("nodemailer"));
    init_google_oauth();
    init_logger();
    log7 = logger.child({ module: "email-sender" });
    transporter = null;
  }
});

// src/infrastructure/queue.ts
function createQueue(name, overrides) {
  const existing = queueInstances.get(name);
  if (existing) return existing;
  const connection = getRedisConnection();
  const queue = new import_bullmq2.Queue(name, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 1e3 },
      removeOnFail: { count: 5e3 },
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3e4
        // 30s → 60s → 120s → 240s → 480s
      }
    },
    ...overrides
  });
  queue.on("error", (err) => {
    log9.error("Queue error", { queue: name, error: err.message });
  });
  queueInstances.set(name, queue);
  log9.info("Queue created", { queue: name });
  return queue;
}
var import_bullmq2, log9, queueInstances;
var init_queue = __esm({
  "src/infrastructure/queue.ts"() {
    "use strict";
    import_bullmq2 = require("bullmq");
    init_redis();
    init_logger();
    log9 = logger.child({ module: "queue-factory" });
    queueInstances = /* @__PURE__ */ new Map();
  }
});

// src/modules/communication/whatsapp-sender.ts
var whatsapp_sender_exports = {};
__export(whatsapp_sender_exports, {
  sendWhatsApp: () => sendWhatsApp
});
async function sendWhatsApp(options) {
  const { userId, to, message } = options;
  const userCred = await prisma.userCredential.findUnique({
    where: { userId_provider: { userId, provider: "twilio" } }
  });
  if (userCred) {
    try {
      const result = await sendWithUserTwilio(userCred, to, message);
      return result;
    } catch (err) {
      log12.warn("User Twilio WhatsApp failed, trying system fallback", {
        userId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const result = await sendWithSystemTwilio(to, message);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log12.error("System Twilio WhatsApp also failed", { userId, error: errorMsg });
      return { success: false, mode: "system_twilio", error: errorMsg };
    }
  }
  log12.warn("No WhatsApp provider configured", { userId });
  return { success: false, mode: "none", error: "No WhatsApp provider configured" };
}
async function sendWithUserTwilio(credential, to, message) {
  const accountSid = decrypt(credential.accessToken);
  const authToken = credential.refreshToken ? decrypt(credential.refreshToken) : "";
  const metadata = credential.metadata;
  const fromNumber = metadata?.whatsappNumber || metadata?.phoneNumber || "";
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Incomplete Twilio credentials for WhatsApp");
  }
  const client = (0, import_twilio.default)(accountSid, authToken);
  const result = await client.messages.create({
    body: message,
    from: `whatsapp:${fromNumber}`,
    to: `whatsapp:${to}`
  });
  log12.info("WhatsApp sent via user Twilio", { to, sid: result.sid });
  return { success: true, mode: "user_twilio", messageSid: result.sid };
}
async function sendWithSystemTwilio(to, message) {
  const client = (0, import_twilio.default)(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER;
  const result = await client.messages.create({
    body: `[Invoice Chaser] ${message}`,
    from: `whatsapp:${fromNumber}`,
    to: `whatsapp:${to}`
  });
  log12.info("WhatsApp sent via system Twilio", { to, sid: result.sid });
  return { success: true, mode: "system_twilio", messageSid: result.sid };
}
var import_twilio, log12;
var init_whatsapp_sender = __esm({
  "src/modules/communication/whatsapp-sender.ts"() {
    "use strict";
    import_twilio = __toESM(require("twilio"));
    init_prisma();
    init_encryption();
    init_logger();
    log12 = logger.child({ module: "whatsapp-sender" });
  }
});

// src/modules/communication/sms-sender.ts
var sms_sender_exports = {};
__export(sms_sender_exports, {
  connectTwilio: () => connectTwilio,
  disconnectTwilio: () => disconnectTwilio,
  isTwilioConnected: () => isTwilioConnected,
  sendSMS: () => sendSMS
});
async function sendSMS(options) {
  const { userId, to, message } = options;
  const userCred = await prisma.userCredential.findUnique({
    where: { userId_provider: { userId, provider: "twilio" } }
  });
  if (userCred) {
    try {
      const result = await sendWithUserTwilio2(userCred, to, message);
      return result;
    } catch (err) {
      log14.warn("User Twilio failed, trying system fallback", {
        userId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const result = await sendWithSystemTwilio2(to, message);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log14.error("System Twilio also failed", { userId, error: errorMsg });
      return { success: false, mode: "system_twilio", error: errorMsg };
    }
  }
  log14.warn("No SMS provider configured", { userId });
  return { success: false, mode: "none", error: "No SMS provider configured" };
}
async function sendWithUserTwilio2(credential, to, message) {
  const accountSid = decrypt(credential.accessToken);
  const authToken = credential.refreshToken ? decrypt(credential.refreshToken) : "";
  const metadata = credential.metadata;
  const fromNumber = metadata?.phoneNumber || "";
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Incomplete Twilio credentials");
  }
  const client = (0, import_twilio2.default)(accountSid, authToken);
  const result = await client.messages.create({
    body: message,
    from: fromNumber,
    to
  });
  log14.info("SMS sent via user Twilio", { to, sid: result.sid });
  return { success: true, mode: "user_twilio", messageSid: result.sid };
}
async function sendWithSystemTwilio2(to, message) {
  const client = (0, import_twilio2.default)(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  const result = await client.messages.create({
    body: `[Invoice Chaser] ${message}`,
    // Prefix to identify system messages
    from: process.env.TWILIO_PHONE_NUMBER,
    to
  });
  log14.info("SMS sent via system Twilio", { to, sid: result.sid });
  return { success: true, mode: "system_twilio", messageSid: result.sid };
}
async function connectTwilio(userId, accountSid, authToken, phoneNumber) {
  try {
    const client = (0, import_twilio2.default)(accountSid, authToken);
    await client.api.accounts(accountSid).fetch();
  } catch (err) {
    return {
      success: false,
      error: "Invalid Twilio credentials. Please check your Account SID and Auth Token."
    };
  }
  await prisma.userCredential.upsert({
    where: { userId_provider: { userId, provider: "twilio" } },
    update: {
      accessToken: encrypt(accountSid),
      refreshToken: encrypt(authToken),
      metadata: { phoneNumber },
      updatedAt: /* @__PURE__ */ new Date()
    },
    create: {
      userId,
      provider: "twilio",
      accessToken: encrypt(accountSid),
      refreshToken: encrypt(authToken),
      metadata: { phoneNumber }
    }
  });
  log14.info("Twilio connected", { userId, phoneNumber });
  return { success: true };
}
async function disconnectTwilio(userId) {
  await prisma.userCredential.deleteMany({
    where: { userId, provider: "twilio" }
  });
  log14.info("Twilio disconnected", { userId });
}
async function isTwilioConnected(userId) {
  const credential = await prisma.userCredential.findUnique({
    where: { userId_provider: { userId, provider: "twilio" } }
  });
  if (credential) {
    const metadata = credential.metadata;
    return { connected: true, mode: "user", phoneNumber: metadata?.phoneNumber };
  }
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    return { connected: true, mode: "system", phoneNumber: process.env.TWILIO_PHONE_NUMBER };
  }
  return { connected: false, mode: "none" };
}
var import_twilio2, log14;
var init_sms_sender = __esm({
  "src/modules/communication/sms-sender.ts"() {
    "use strict";
    import_twilio2 = __toESM(require("twilio"));
    init_prisma();
    init_encryption();
    init_encryption();
    init_logger();
    log14 = logger.child({ module: "sms-sender" });
  }
});

// src/modules/queues/email-queue.ts
var email_queue_exports = {};
__export(email_queue_exports, {
  cancelPendingEmailJobs: () => cancelPendingEmailJobs,
  enqueueDelayedEmailJob: () => enqueueDelayedEmailJob,
  enqueueEmailJob: () => enqueueEmailJob,
  getEmailQueue: () => getEmailQueue
});
function getEmailQueue() {
  return createQueue(QUEUE_NAMES.EMAIL);
}
async function enqueueEmailJob(data) {
  const queue = getEmailQueue();
  const jobId = data.idempotencyKey;
  try {
    await queue.add("send-reminder", data, {
      jobId,
      // Override default attempts for email — 5 retries with exponential backoff
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3e4
        // 30s, 60s, 120s, 240s, 480s
      }
    });
    log16.info("Email job enqueued", {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Job already exists")) {
      log16.info("Email job already exists (idempotent skip)", {
        jobId,
        invoiceId: data.invoiceId
      });
      return;
    }
    throw err;
  }
}
async function enqueueDelayedEmailJob(data, delayMs) {
  const queue = getEmailQueue();
  const jobId = data.idempotencyKey;
  try {
    await queue.add("send-reminder", data, {
      jobId,
      delay: Math.max(0, delayMs),
      // BullMQ requires non-negative delay
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3e4
      }
    });
    log16.info("Delayed email job enqueued", {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      delayMs,
      scheduledFor: new Date(Date.now() + delayMs).toISOString()
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Job already exists")) {
      log16.info("Delayed email job already exists (idempotent skip)", {
        jobId,
        invoiceId: data.invoiceId
      });
      return;
    }
    throw err;
  }
}
async function cancelPendingEmailJobs(invoiceId) {
  const queue = getEmailQueue();
  let cancelled = 0;
  for (const stage of [1, 2, 3, 4]) {
    const jobId = `email:${invoiceId}:stage:${stage}`;
    try {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        if (state === "delayed" || state === "waiting") {
          await job.remove();
          cancelled++;
          log16.info("Cancelled pending email job", { jobId, invoiceId, stage, state });
        }
      }
    } catch (err) {
      log16.warn("Failed to cancel email job", {
        jobId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return cancelled;
}
var log16;
var init_email_queue = __esm({
  "src/modules/queues/email-queue.ts"() {
    "use strict";
    init_queue();
    init_queue_names();
    init_logger();
    log16 = logger.child({ module: "email-queue" });
  }
});

// src/modules/queues/whatsapp-queue.ts
var whatsapp_queue_exports = {};
__export(whatsapp_queue_exports, {
  cancelPendingWhatsAppJobs: () => cancelPendingWhatsAppJobs,
  enqueueDelayedWhatsAppJob: () => enqueueDelayedWhatsAppJob,
  enqueueWhatsAppJob: () => enqueueWhatsAppJob,
  getWhatsAppQueue: () => getWhatsAppQueue
});
function getWhatsAppQueue() {
  return createQueue(QUEUE_NAMES.WHATSAPP);
}
async function enqueueWhatsAppJob(data) {
  const queue = getWhatsAppQueue();
  const jobId = data.idempotencyKey;
  try {
    await queue.add("send-whatsapp", data, {
      jobId,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3e4
      }
    });
    log17.info("WhatsApp job enqueued", {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      whatsappNumber: data.whatsappNumber
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Job already exists")) {
      log17.info("WhatsApp job already exists (idempotent skip)", {
        jobId,
        invoiceId: data.invoiceId
      });
      return;
    }
    throw err;
  }
}
async function enqueueDelayedWhatsAppJob(data, delayMs) {
  const queue = getWhatsAppQueue();
  const jobId = data.idempotencyKey;
  try {
    await queue.add("send-whatsapp", data, {
      jobId,
      delay: Math.max(0, delayMs),
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3e4
      }
    });
    log17.info("Delayed WhatsApp job enqueued", {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      delayMs,
      scheduledFor: new Date(Date.now() + delayMs).toISOString()
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Job already exists")) {
      log17.info("Delayed WhatsApp job already exists (idempotent skip)", {
        jobId,
        invoiceId: data.invoiceId
      });
      return;
    }
    throw err;
  }
}
async function cancelPendingWhatsAppJobs(invoiceId) {
  const queue = getWhatsAppQueue();
  let cancelled = 0;
  for (const stage of [1, 2, 3, 4]) {
    const jobId = `whatsapp:${invoiceId}:stage:${stage}`;
    try {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        if (state === "delayed" || state === "waiting") {
          await job.remove();
          cancelled++;
          log17.info("Cancelled pending whatsapp job", { jobId, invoiceId, stage, state });
        }
      }
    } catch (err) {
      log17.warn("Failed to cancel whatsapp job", {
        jobId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return cancelled;
}
var log17;
var init_whatsapp_queue = __esm({
  "src/modules/queues/whatsapp-queue.ts"() {
    "use strict";
    init_queue();
    init_queue_names();
    init_logger();
    log17 = logger.child({ module: "whatsapp-queue" });
  }
});

// src/modules/queues/sms-queue.ts
var sms_queue_exports = {};
__export(sms_queue_exports, {
  cancelPendingSMSJobs: () => cancelPendingSMSJobs,
  enqueueDelayedSMSJob: () => enqueueDelayedSMSJob,
  enqueueSMSJob: () => enqueueSMSJob,
  getSMSQueue: () => getSMSQueue
});
function getSMSQueue() {
  return createQueue(QUEUE_NAMES.SMS);
}
async function enqueueSMSJob(data) {
  const queue = getSMSQueue();
  const jobId = data.idempotencyKey;
  try {
    await queue.add("send-sms", data, {
      jobId,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3e4
      }
    });
    log18.info("SMS job enqueued", {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      smsNumber: data.smsNumber
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Job already exists")) {
      log18.info("SMS job already exists (idempotent skip)", {
        jobId,
        invoiceId: data.invoiceId
      });
      return;
    }
    throw err;
  }
}
async function enqueueDelayedSMSJob(data, delayMs) {
  const queue = getSMSQueue();
  const jobId = data.idempotencyKey;
  try {
    await queue.add("send-sms", data, {
      jobId,
      delay: Math.max(0, delayMs),
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 3e4
      }
    });
    log18.info("Delayed SMS job enqueued", {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      delayMs,
      scheduledFor: new Date(Date.now() + delayMs).toISOString()
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Job already exists")) {
      log18.info("Delayed SMS job already exists (idempotent skip)", {
        jobId,
        invoiceId: data.invoiceId
      });
      return;
    }
    throw err;
  }
}
async function cancelPendingSMSJobs(invoiceId) {
  const queue = getSMSQueue();
  let cancelled = 0;
  for (const stage of [1, 2, 3, 4]) {
    const jobId = `sms:${invoiceId}:stage:${stage}`;
    try {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        if (state === "delayed" || state === "waiting") {
          await job.remove();
          cancelled++;
          log18.info("Cancelled pending SMS job", { jobId, invoiceId, stage, state });
        }
      }
    } catch (err) {
      log18.warn("Failed to cancel SMS job", {
        jobId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return cancelled;
}
var log18;
var init_sms_queue = __esm({
  "src/modules/queues/sms-queue.ts"() {
    "use strict";
    init_queue();
    init_queue_names();
    init_logger();
    log18 = logger.child({ module: "sms-queue" });
  }
});

// src/workers/worker-entry.ts
var import_config = require("dotenv/config");

// src/workers/email.worker.ts
var import_bullmq = require("bullmq");
init_redis();
init_queue_names();
init_prisma();
init_logger();

// src/modules/queues/job-wrapper.ts
init_prisma();
init_logger();
var log3 = logger.child({ module: "idempotency-guard" });
async function withIdempotencyGuard(channel, job, executeBusiness) {
  const { invoiceId, stage, idempotencyKey, reminderTone } = job.data;
  log3.info(`Processing ${channel} job`, {
    jobId: job.id,
    invoiceId,
    stage,
    attempt: job.attemptsMade + 1,
    idempotencyKey
  });
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      status: true,
      reminderStage: true,
      idempotencyKeys: true,
      userId: true
    }
  });
  if (!invoice) {
    log3.warn("Invoice not found, skipping job", { invoiceId, jobId: job.id });
    return;
  }
  if (invoice.status === "PAID") {
    log3.info("Invoice already paid, skipping", { invoiceId, jobId: job.id, channel });
    await prisma.reminderLog.create({
      data: {
        invoiceId,
        stage,
        status: "skipped",
        error: "Invoice already paid",
        jobId: job.id ?? null,
        idempotencyKey
      }
    });
    return;
  }
  const updateResult = await prisma.invoice.updateMany({
    where: {
      id: invoiceId,
      status: "UNPAID",
      NOT: { idempotencyKeys: { has: idempotencyKey } }
    },
    data: {
      reminderStage: stage,
      lastReminderSentAt: /* @__PURE__ */ new Date(),
      idempotencyKeys: { push: idempotencyKey }
    }
  });
  if (updateResult.count === 0) {
    log3.info("Idempotency check failed \u2014 already processed", { invoiceId, idempotencyKey, jobId: job.id });
    await prisma.reminderLog.create({
      data: { invoiceId, stage, status: "skipped", error: "Idempotency key already exists", jobId: job.id ?? null, idempotencyKey }
    });
    return;
  }
  try {
    const result = await executeBusiness(invoice);
    await prisma.reminderLog.create({
      data: {
        invoiceId,
        stage,
        status: "sent",
        jobId: job.id ?? null,
        idempotencyKey,
        channel,
        tone: reminderTone,
        messageBody: result.plainText
      }
    });
    const { eventBus: eventBus2 } = await Promise.resolve().then(() => (init_event_bus(), event_bus_exports));
    eventBus2.emit("invoice.overdue", { invoiceId, stage });
    await prisma.invoiceEvent.create({
      data: {
        invoiceId,
        eventType: "reminder_sent",
        metadata: { channel, stage, tone: reminderTone }
      }
    });
    log3.info(`Reminder ${channel} sent successfully`, { invoiceId, stage, jobId: job.id });
  } catch (error) {
    log3.error(`${channel} send failed, rolling back idempotency key for retry`, {
      invoiceId,
      stage,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts,
      error: error instanceof Error ? error.message : String(error)
    });
    const currentInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { idempotencyKeys: true, reminderStage: true }
    });
    if (currentInvoice) {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          idempotencyKeys: currentInvoice.idempotencyKeys.filter((k) => k !== idempotencyKey),
          reminderStage: Math.max(0, stage - 1),
          lastReminderSentAt: null
        }
      });
    }
    await prisma.reminderLog.create({
      data: {
        invoiceId,
        stage,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        jobId: job.id ?? null,
        idempotencyKey
      }
    });
    throw error;
  }
}

// src/workers/email.worker.ts
var log8 = logger.child({ module: "email-worker" });
async function processEmailJob(job) {
  const { stage, clientEmail, clientName, amount, dueDate, daysOverdue, paymentLinkToken, reminderTone } = job.data;
  await withIdempotencyGuard("email", job, async (invoice) => {
    const { generateMessage: generateMessage2 } = await Promise.resolve().then(() => (init_message_generator(), message_generator_exports));
    const { sendEmail: sendEmail2 } = await Promise.resolve().then(() => (init_email_sender(), email_sender_exports));
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const paymentLink = paymentLinkToken ? `${baseUrl}/pay/${paymentLinkToken}` : void 0;
    const trackingPixelUrl = `${baseUrl}/api/track/email?invoice=${invoice.id}&stage=${stage}&t=${Date.now()}`;
    const generated = await generateMessage2({
      clientName,
      amount,
      dueDate,
      stage,
      daysOverdue,
      paymentLink,
      tone: reminderTone || "PROFESSIONAL"
    });
    const result = await sendEmail2({
      userId: invoice.userId,
      to: clientEmail,
      subject: generated.subject,
      htmlBody: generated.htmlBody,
      plainText: generated.plainText,
      trackingPixelUrl
    });
    if (!result.success) {
      throw new Error(result.error || "Unknown email send error");
    }
    return { plainText: generated.plainText };
  });
}
async function onJobFailed(job, err) {
  if (!job) return;
  const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 5);
  if (isLastAttempt) {
    log8.error("Email job permanently failed \u2014 dead letter", {
      jobId: job.id,
      invoiceId: job.data.invoiceId,
      stage: job.data.stage,
      attempts: job.attemptsMade,
      error: err.message
    });
    try {
      await prisma.reminderLog.create({
        data: {
          invoiceId: job.data.invoiceId,
          stage: job.data.stage,
          status: "dead_letter",
          error: `Permanently failed after ${job.attemptsMade} attempts: ${err.message}`,
          jobId: job.id ?? null,
          idempotencyKey: job.data.idempotencyKey
        }
      });
    } catch (logErr) {
      log8.error("Failed to log dead letter", {
        error: logErr instanceof Error ? logErr.message : String(logErr)
      });
    }
  }
}
function startEmailWorker(concurrency = 5) {
  const connection = createRedisConnection();
  const worker = new import_bullmq.Worker(
    QUEUE_NAMES.EMAIL,
    processEmailJob,
    {
      connection,
      concurrency,
      // Stalled job check: if a job doesn't report progress in 30s,
      // consider it stalled and re-queue it.
      stalledInterval: 3e4,
      // Lock duration: how long a job is "locked" to this worker
      lockDuration: 6e4
    }
  );
  worker.on("completed", (job) => {
    log8.info("Email job completed", {
      jobId: job.id,
      invoiceId: job.data.invoiceId,
      stage: job.data.stage
    });
  });
  worker.on("failed", (job, err) => {
    onJobFailed(job, err);
  });
  worker.on("error", (err) => {
    log8.error("Email worker error", { error: err.message });
  });
  log8.info("Email worker started", { concurrency, queue: QUEUE_NAMES.EMAIL });
  return worker;
}

// src/workers/overdue-check.worker.ts
var import_bullmq3 = require("bullmq");
init_redis();
init_queue_names();
init_event_bus();
init_prisma();
init_logger();

// src/modules/queues/overdue-check-queue.ts
init_queue();
init_queue_names();
init_logger();
var log10 = logger.child({ module: "overdue-check-queue" });
function getOverdueCheckQueue() {
  return createQueue(QUEUE_NAMES.OVERDUE_CHECK);
}
async function scheduleOverdueChecks(data) {
  const queue = getOverdueCheckQueue();
  let checkpoints = [];
  if (data.chasingProfile === "STRICT") {
    checkpoints = [
      { daysOverdue: 1, stage: 2 },
      { daysOverdue: 3, stage: 3 },
      { daysOverdue: 5, stage: 4 }
    ];
  } else if (data.chasingProfile === "RELAXED") {
    checkpoints = [
      { daysOverdue: 7, stage: 2 },
      { daysOverdue: 14, stage: 3 },
      { daysOverdue: 30, stage: 4 }
    ];
  } else {
    checkpoints = [
      { daysOverdue: 3, stage: 2 },
      { daysOverdue: 7, stage: 3 },
      { daysOverdue: 14, stage: 4 }
    ];
  }
  for (const checkpoint of checkpoints) {
    const jobId = `overdue:${data.invoiceId}:day:${checkpoint.daysOverdue}`;
    const targetTime = new Date(data.dueDate.getTime() + checkpoint.daysOverdue * 24 * 60 * 60 * 1e3);
    const delayMs = Math.max(0, targetTime.getTime() - Date.now());
    try {
      await queue.add(
        "check-overdue",
        {
          invoiceId: data.invoiceId,
          userId: data.userId,
          clientEmail: data.clientEmail,
          clientName: data.clientName,
          amount: data.amount,
          dueDate: data.dueDate.toISOString(),
          daysOverdue: checkpoint.daysOverdue,
          stage: checkpoint.stage,
          contactChannel: data.contactChannel,
          whatsappNumber: data.whatsappNumber || null,
          smsNumber: data.smsNumber || null,
          paymentLinkToken: data.paymentLinkToken,
          reminderTone: data.reminderTone,
          chaseUntilPaid: data.chaseUntilPaid,
          chaseIntervalDays: data.chaseIntervalDays
        },
        {
          jobId,
          delay: delayMs,
          attempts: 3,
          // Fewer retries — checking is cheap
          backoff: {
            type: "exponential",
            delay: 1e4
          }
        }
      );
      log10.info("Overdue check scheduled", {
        jobId,
        invoiceId: data.invoiceId,
        daysOverdue: checkpoint.daysOverdue,
        stage: checkpoint.stage,
        scheduledFor: targetTime.toISOString()
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("Job already exists")) {
        log10.info("Overdue check already scheduled (idempotent skip)", {
          jobId,
          invoiceId: data.invoiceId
        });
        continue;
      }
      throw err;
    }
  }
}
async function scheduleRecurringCheck(data, newDaysOverdue) {
  const queue = getOverdueCheckQueue();
  const jobId = `overdue:${data.invoiceId}:day:${newDaysOverdue}:recurring`;
  const targetTime = new Date(new Date(data.dueDate).getTime() + newDaysOverdue * 24 * 60 * 60 * 1e3);
  const delayMs = Math.max(0, targetTime.getTime() - Date.now());
  try {
    await queue.add(
      "check-overdue",
      {
        ...data,
        daysOverdue: newDaysOverdue,
        stage: data.stage + 1
        // Keep incrementing stage to track how many times chased
      },
      {
        jobId,
        delay: delayMs,
        attempts: 3,
        backoff: { type: "exponential", delay: 1e4 }
      }
    );
    log10.info("Recurring overdue check scheduled", { jobId, invoiceId: data.invoiceId, newDaysOverdue, scheduledFor: targetTime.toISOString() });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Job already exists")) {
      return;
    }
    throw err;
  }
}
async function cancelPendingOverdueChecks(invoiceId) {
  const queue = getOverdueCheckQueue();
  let cancelled = 0;
  for (const day of [1, 3, 5, 7, 14, 30]) {
    const jobId = `overdue:${invoiceId}:day:${day}`;
    try {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        if (state === "delayed" || state === "waiting") {
          await job.remove();
          cancelled++;
          log10.info("Cancelled pending overdue check", { jobId, invoiceId, day, state });
        }
      }
    } catch (err) {
      log10.warn("Failed to cancel overdue check", {
        jobId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return cancelled;
}

// src/workers/overdue-check.worker.ts
var log11 = logger.child({ module: "overdue-check-worker" });
async function processOverdueCheck(job) {
  const { invoiceId, userId, clientEmail, clientName, amount, dueDate, daysOverdue, stage, contactChannel, whatsappNumber, smsNumber, chaseUntilPaid, chaseIntervalDays, paymentLinkToken, reminderTone } = job.data;
  log11.info("Processing overdue check", {
    jobId: job.id,
    invoiceId,
    daysOverdue,
    stage
  });
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      status: true,
      reminderStage: true
    }
  });
  if (!invoice) {
    log11.warn("Invoice not found during overdue check", { invoiceId });
    return;
  }
  if (invoice.status === "PAID") {
    log11.info("Invoice already paid, skipping overdue check", {
      invoiceId,
      daysOverdue
    });
    return;
  }
  if (invoice.reminderStage >= stage) {
    log11.info("Invoice already at or past this reminder stage, skipping", {
      invoiceId,
      currentStage: invoice.reminderStage,
      checkStage: stage
    });
    return;
  }
  log11.info("Invoice overdue confirmed", {
    invoiceId,
    daysOverdue,
    stage,
    currentStage: invoice.reminderStage
  });
  eventBus.emit("invoice.overdue", {
    invoiceId,
    userId,
    clientEmail,
    clientName,
    amount,
    dueDate: new Date(dueDate),
    daysOverdue,
    stage,
    contactChannel: contactChannel || "EMAIL",
    whatsappNumber: whatsappNumber || null,
    smsNumber: smsNumber || null,
    paymentLinkToken,
    reminderTone,
    chaseUntilPaid,
    chaseIntervalDays
  });
  if (chaseUntilPaid) {
    const nextDaysOverdue = daysOverdue + chaseIntervalDays;
    if (stage >= 4) {
      await scheduleRecurringCheck(job.data, nextDaysOverdue);
      log11.info("Scheduled next recurring check", { invoiceId, nextDaysOverdue });
    }
  }
}
function startOverdueCheckWorker(concurrency = 10) {
  const connection = createRedisConnection();
  const worker = new import_bullmq3.Worker(
    QUEUE_NAMES.OVERDUE_CHECK,
    processOverdueCheck,
    {
      connection,
      concurrency,
      stalledInterval: 3e4,
      lockDuration: 3e4
    }
  );
  worker.on("completed", (job) => {
    log11.info("Overdue check completed", {
      jobId: job.id,
      invoiceId: job.data.invoiceId,
      daysOverdue: job.data.daysOverdue
    });
  });
  worker.on("failed", (job, err) => {
    log11.error("Overdue check failed", {
      jobId: job?.id,
      invoiceId: job?.data.invoiceId,
      error: err.message
    });
  });
  worker.on("error", (err) => {
    log11.error("Overdue check worker error", { error: err.message });
  });
  log11.info("Overdue check worker started", {
    concurrency,
    queue: QUEUE_NAMES.OVERDUE_CHECK
  });
  return worker;
}

// src/workers/whatsapp.worker.ts
var import_bullmq4 = require("bullmq");
init_redis();
init_queue_names();
init_logger();
var log13 = logger.child({ module: "whatsapp-worker" });
async function processWhatsAppJob(job) {
  const { stage, whatsappNumber, clientName, amount, dueDate, daysOverdue, paymentLinkToken, reminderTone } = job.data;
  await withIdempotencyGuard("whatsapp", job, async (invoice) => {
    const { generateMessage: generateMessage2 } = await Promise.resolve().then(() => (init_message_generator(), message_generator_exports));
    const { sendWhatsApp: sendWhatsApp2 } = await Promise.resolve().then(() => (init_whatsapp_sender(), whatsapp_sender_exports));
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const paymentLink = paymentLinkToken ? `${baseUrl}/pay/${paymentLinkToken}` : void 0;
    const generated = await generateMessage2({
      clientName,
      amount,
      dueDate,
      stage,
      daysOverdue,
      paymentLink,
      tone: reminderTone || "PROFESSIONAL"
    });
    const textToSend = generated.smsText || generated.plainText.substring(0, 1e3);
    const result = await sendWhatsApp2({
      userId: invoice.userId,
      to: whatsappNumber,
      message: textToSend
    });
    if (!result.success) {
      throw new Error(result.error || "Unknown WhatsApp send error");
    }
    log13.info("WhatsApp message sent", {
      invoiceId: job.data.invoiceId,
      stage,
      mode: result.mode,
      sid: result.messageSid
    });
    return { plainText: textToSend };
  });
}
function startWhatsAppWorker() {
  const connection = createRedisConnection();
  const worker = new import_bullmq4.Worker(
    QUEUE_NAMES.WHATSAPP,
    processWhatsAppJob,
    {
      connection,
      concurrency: 5,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 }
    }
  );
  worker.on("failed", (job, err) => {
    log13.error("WhatsApp job failed", {
      jobId: job?.id,
      invoiceId: job?.data.invoiceId,
      stage: job?.data.stage,
      error: err.message
    });
  });
  worker.on("ready", () => {
    log13.info("WhatsApp worker started", { queue: QUEUE_NAMES.WHATSAPP });
  });
  return worker;
}

// src/workers/sms.worker.ts
var import_bullmq5 = require("bullmq");
init_redis();
init_queue_names();
init_logger();
var log15 = logger.child({ module: "sms-worker" });
async function processSMSJob(job) {
  const { stage, smsNumber, clientName, amount, dueDate, daysOverdue, paymentLinkToken, reminderTone } = job.data;
  await withIdempotencyGuard("sms", job, async (invoice) => {
    const { generateMessage: generateMessage2 } = await Promise.resolve().then(() => (init_message_generator(), message_generator_exports));
    const { sendSMS: sendSMS2 } = await Promise.resolve().then(() => (init_sms_sender(), sms_sender_exports));
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const paymentLink = paymentLinkToken ? `${baseUrl}/pay/${paymentLinkToken}` : void 0;
    const generated = await generateMessage2({
      clientName,
      amount,
      dueDate,
      stage,
      daysOverdue,
      paymentLink,
      tone: reminderTone || "PROFESSIONAL"
    });
    const textToSend = generated.smsText || generated.plainText.substring(0, 160);
    const result = await sendSMS2({
      userId: invoice.userId,
      to: smsNumber,
      message: textToSend
    });
    if (!result.success) {
      throw new Error(result.error || "Unknown SMS send error");
    }
    return { plainText: textToSend };
  });
}
function startSMSWorker() {
  const connection = createRedisConnection();
  const worker = new import_bullmq5.Worker(
    QUEUE_NAMES.SMS,
    processSMSJob,
    {
      connection,
      concurrency: 5,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 }
    }
  );
  worker.on("failed", (job, err) => {
    log15.error("SMS job failed", {
      jobId: job?.id,
      invoiceId: job?.data.invoiceId,
      stage: job?.data.stage,
      error: err.message
    });
  });
  worker.on("ready", () => {
    log15.info("SMS worker started", { queue: QUEUE_NAMES.SMS });
  });
  return worker;
}

// src/modules/notification/notification.subscriber.ts
init_event_bus();
init_email_queue();
init_logger();
var log19 = logger.child({ module: "notification-subscriber" });
async function onInvoiceCreated(event) {
  log19.info("Handling invoice.created", { invoiceId: event.invoiceId });
  const dueDate = new Date(event.dueDate);
  const delayMs = Math.max(0, dueDate.getTime() - Date.now());
  const shouldSendEmail = ["EMAIL", "BOTH", "EMAIL_AND_SMS", "ALL"].includes(event.contactChannel);
  const shouldSendWhatsapp = ["WHATSAPP", "BOTH", "ALL"].includes(event.contactChannel);
  const shouldSendSms = ["SMS", "EMAIL_AND_SMS", "ALL"].includes(event.contactChannel);
  if (shouldSendEmail) {
    const emailData = {
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientEmail: event.clientEmail,
      clientName: event.clientName,
      amount: event.amount,
      dueDate: dueDate.toISOString(),
      stage: 1,
      idempotencyKey: `email:${event.invoiceId}:stage:1`,
      daysOverdue: 0,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone
    };
    await enqueueDelayedEmailJob(emailData, delayMs);
  }
  if (shouldSendWhatsapp && event.whatsappNumber) {
    const { enqueueDelayedWhatsAppJob: enqueueDelayedWhatsAppJob2 } = await Promise.resolve().then(() => (init_whatsapp_queue(), whatsapp_queue_exports));
    await enqueueDelayedWhatsAppJob2({
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientName: event.clientName,
      whatsappNumber: event.whatsappNumber,
      amount: event.amount,
      dueDate: dueDate.toISOString(),
      stage: 1,
      daysOverdue: 0,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone,
      idempotencyKey: `whatsapp:${event.invoiceId}:stage:1`
    }, delayMs);
  }
  if (shouldSendSms && event.smsNumber) {
    const { enqueueDelayedSMSJob: enqueueDelayedSMSJob2 } = await Promise.resolve().then(() => (init_sms_queue(), sms_queue_exports));
    await enqueueDelayedSMSJob2({
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientName: event.clientName,
      smsNumber: event.smsNumber,
      amount: event.amount,
      dueDate: dueDate.toISOString(),
      stage: 1,
      idempotencyKey: `sms:${event.invoiceId}:stage:1`,
      daysOverdue: 0,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone
    }, delayMs);
  }
  await scheduleOverdueChecks({
    invoiceId: event.invoiceId,
    userId: event.userId,
    clientEmail: event.clientEmail,
    clientName: event.clientName,
    amount: event.amount,
    dueDate,
    chasingProfile: event.chasingProfile,
    contactChannel: event.contactChannel,
    whatsappNumber: event.whatsappNumber,
    smsNumber: event.smsNumber,
    paymentLinkToken: event.paymentLinkToken,
    reminderTone: event.reminderTone,
    chaseUntilPaid: event.chaseUntilPaid,
    chaseIntervalDays: event.chaseIntervalDays
  });
  log19.info("All jobs scheduled for new invoice", {
    invoiceId: event.invoiceId,
    paymentDueIn: `${Math.round(delayMs / (1e3 * 60 * 60))}h`
  });
}
async function onInvoicePaymentDue(event) {
  log19.info("Invoice payment due event received", {
    invoiceId: event.invoiceId,
    dueDate: event.dueDate.toISOString()
  });
}
async function onInvoiceOverdue(event) {
  log19.info("Invoice overdue event received", {
    invoiceId: event.invoiceId,
    daysOverdue: event.daysOverdue,
    stage: event.stage
  });
  const shouldSendEmail = ["EMAIL", "BOTH", "EMAIL_AND_SMS", "ALL"].includes(event.contactChannel);
  const shouldSendWhatsapp = ["WHATSAPP", "BOTH", "ALL"].includes(event.contactChannel);
  const shouldSendSms = ["SMS", "EMAIL_AND_SMS", "ALL"].includes(event.contactChannel);
  if (shouldSendEmail) {
    const emailData = {
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientEmail: event.clientEmail,
      clientName: event.clientName,
      amount: event.amount,
      dueDate: new Date(event.dueDate).toISOString(),
      stage: event.stage,
      idempotencyKey: `email:${event.invoiceId}:stage:${event.stage}`,
      daysOverdue: event.daysOverdue,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone
    };
    const { enqueueEmailJob: enqueueEmailJob2 } = await Promise.resolve().then(() => (init_email_queue(), email_queue_exports));
    await enqueueEmailJob2(emailData);
  }
  if (shouldSendWhatsapp && event.whatsappNumber) {
    const { enqueueWhatsAppJob: enqueueWhatsAppJob2 } = await Promise.resolve().then(() => (init_whatsapp_queue(), whatsapp_queue_exports));
    await enqueueWhatsAppJob2({
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientName: event.clientName,
      whatsappNumber: event.whatsappNumber,
      amount: event.amount,
      dueDate: new Date(event.dueDate).toISOString(),
      stage: event.stage,
      daysOverdue: event.daysOverdue,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone,
      idempotencyKey: `whatsapp:${event.invoiceId}:stage:${event.stage}`
    });
  }
  if (shouldSendSms && event.smsNumber) {
    const { enqueueSMSJob: enqueueSMSJob2 } = await Promise.resolve().then(() => (init_sms_queue(), sms_queue_exports));
    await enqueueSMSJob2({
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientName: event.clientName,
      smsNumber: event.smsNumber,
      amount: event.amount,
      dueDate: new Date(event.dueDate).toISOString(),
      stage: event.stage,
      idempotencyKey: `sms:${event.invoiceId}:stage:${event.stage}`,
      daysOverdue: event.daysOverdue,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone
    });
  }
}
async function onInvoicePaid(event) {
  log19.info("Invoice paid \u2014 cancelling all pending jobs", {
    invoiceId: event.invoiceId
  });
  const { cancelPendingWhatsAppJobs: cancelPendingWhatsAppJobs2 } = await Promise.resolve().then(() => (init_whatsapp_queue(), whatsapp_queue_exports));
  const { cancelPendingSMSJobs: cancelPendingSMSJobs2 } = await Promise.resolve().then(() => (init_sms_queue(), sms_queue_exports));
  const [emailsCancelled, overdueChecksCancelled, whatsappCancelled, smsCancelled] = await Promise.all([
    cancelPendingEmailJobs(event.invoiceId),
    cancelPendingOverdueChecks(event.invoiceId),
    cancelPendingWhatsAppJobs2(event.invoiceId),
    cancelPendingSMSJobs2(event.invoiceId)
  ]);
  log19.info("Pending jobs cancelled for paid invoice", {
    invoiceId: event.invoiceId,
    emailsCancelled,
    overdueChecksCancelled,
    whatsappCancelled,
    smsCancelled
  });
}
function registerNotificationSubscribers() {
  eventBus.on("invoice.created", onInvoiceCreated);
  eventBus.on("invoice.payment_due", onInvoicePaymentDue);
  eventBus.on("invoice.overdue", onInvoiceOverdue);
  eventBus.on("invoice.paid", onInvoicePaid);
  log19.info("Notification subscribers registered");
}

// src/modules/events/audit.subscriber.ts
init_event_bus();
init_prisma();
init_logger();
var log20 = logger.child({ module: "audit-subscriber" });
async function onInvoiceCreated2(event) {
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: event.invoiceId,
      eventType: "created",
      metadata: {
        amount: event.amount,
        dueDate: event.dueDate,
        contactChannel: event.contactChannel,
        chasingProfile: event.chasingProfile,
        chaseUntilPaid: event.chaseUntilPaid
      }
    }
  });
}
async function onInvoicePaymentDue2(event) {
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: event.invoiceId,
      eventType: "payment_due",
      metadata: {
        amount: event.amount,
        contactChannel: event.contactChannel
      }
    }
  });
}
async function onInvoiceOverdue2(event) {
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: event.invoiceId,
      eventType: "overdue",
      metadata: {
        daysOverdue: event.daysOverdue,
        stage: event.stage,
        contactChannel: event.contactChannel
      }
    }
  });
}
async function onInvoicePaid2(event) {
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: event.invoiceId,
      eventType: "paid",
      metadata: {
        userId: event.userId
      }
    }
  });
}
function registerAuditSubscribers() {
  eventBus.on("invoice.created", onInvoiceCreated2);
  eventBus.on("invoice.payment_due", onInvoicePaymentDue2);
  eventBus.on("invoice.overdue", onInvoiceOverdue2);
  eventBus.on("invoice.paid", onInvoicePaid2);
  log20.info("Audit subscribers registered");
}

// src/modules/events/event-registry.ts
init_logger();
var log21 = logger.child({ module: "event-registry" });
var registered = false;
function registerAllEventHandlers() {
  if (registered) {
    log21.info("Event handlers already registered, skipping");
    return;
  }
  registerNotificationSubscribers();
  registerAuditSubscribers();
  registered = true;
  log21.info("All event handlers registered");
}

// src/workers/worker-entry.ts
init_redis();
init_logger();
var log22 = logger.child({ module: "worker-entry" });
async function main() {
  log22.info("Starting worker process...", {
    pid: process.pid,
    nodeVersion: process.version,
    env: process.env.NODE_ENV || "development"
  });
  registerAllEventHandlers();
  const emailWorker = startEmailWorker(5);
  const overdueCheckWorker = startOverdueCheckWorker(10);
  const whatsappWorker = startWhatsAppWorker();
  const smsWorker = startSMSWorker();
  log22.info("All workers started successfully", {
    workers: ["email", "overdue-check", "whatsapp", "sms"]
  });
  let isShuttingDown = false;
  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log22.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await Promise.allSettled([
        emailWorker.close(),
        overdueCheckWorker.close(),
        whatsappWorker.close(),
        smsWorker.close()
      ]);
      log22.info("Workers closed");
      await disconnectRedis();
      log22.info("Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      log22.error("Error during shutdown", {
        error: err instanceof Error ? err.message : String(err)
      });
      process.exit(1);
    }
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("uncaughtException", (err) => {
    log22.error("Uncaught exception in worker process", {
      error: err.message,
      stack: err.stack
    });
  });
  process.on("unhandledRejection", (reason) => {
    log22.error("Unhandled rejection in worker process", {
      error: reason instanceof Error ? reason.message : String(reason)
    });
  });
}
main().catch((err) => {
  log22.error("Fatal error starting workers", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : void 0
  });
  process.exit(1);
});
