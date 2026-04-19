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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

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
      log19.warn("Redis connection retry", { attempt: times, delayMs: delay });
      return delay;
    },
    reconnectOnError(err) {
      const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
      return targetErrors.some((e) => err.message.includes(e));
    }
  });
  redisInstance.on("connect", () => {
    log19.info("Redis connected");
  });
  redisInstance.on("error", (err) => {
    log19.error("Redis connection error", { error: err.message });
  });
  redisInstance.on("close", () => {
    log19.warn("Redis connection closed");
  });
  return redisInstance;
}
async function checkRedisHealth() {
  const start = Date.now();
  try {
    const conn = getRedisConnection();
    await conn.ping();
    return { status: "up", latencyMs: Date.now() - start };
  } catch {
    return { status: "down", latencyMs: Date.now() - start };
  }
}
var import_ioredis, log19, redisInstance;
var init_redis = __esm({
  "src/infrastructure/redis.ts"() {
    "use strict";
    import_ioredis = __toESM(require("ioredis"));
    init_logger();
    log19 = logger.child({ module: "redis" });
    redisInstance = null;
  }
});

// src/infrastructure/queue.ts
function createQueue(name, overrides) {
  const existing = queueInstances.get(name);
  if (existing) return existing;
  const connection = getRedisConnection();
  const queue = new import_bullmq.Queue(name, {
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
    log25.error("Queue error", { queue: name, error: err.message });
  });
  queueInstances.set(name, queue);
  log25.info("Queue created", { queue: name });
  return queue;
}
var import_bullmq, log25, queueInstances;
var init_queue = __esm({
  "src/infrastructure/queue.ts"() {
    "use strict";
    import_bullmq = require("bullmq");
    init_redis();
    init_logger();
    log25 = logger.child({ module: "queue-factory" });
    queueInstances = /* @__PURE__ */ new Map();
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
    log26.info("Email job enqueued", {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Job already exists")) {
      log26.info("Email job already exists (idempotent skip)", {
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
    log26.info("Delayed email job enqueued", {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      delayMs,
      scheduledFor: new Date(Date.now() + delayMs).toISOString()
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Job already exists")) {
      log26.info("Delayed email job already exists (idempotent skip)", {
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
          log26.info("Cancelled pending email job", { jobId, invoiceId, stage, state });
        }
      }
    } catch (err) {
      log26.warn("Failed to cancel email job", {
        jobId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return cancelled;
}
var log26;
var init_email_queue = __esm({
  "src/modules/queues/email-queue.ts"() {
    "use strict";
    init_queue();
    init_queue_names();
    init_logger();
    log26 = logger.child({ module: "email-queue" });
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
    log28.info("WhatsApp job enqueued", {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      whatsappNumber: data.whatsappNumber
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Job already exists")) {
      log28.info("WhatsApp job already exists (idempotent skip)", {
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
    log28.info("Delayed WhatsApp job enqueued", {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      delayMs,
      scheduledFor: new Date(Date.now() + delayMs).toISOString()
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Job already exists")) {
      log28.info("Delayed WhatsApp job already exists (idempotent skip)", {
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
          log28.info("Cancelled pending whatsapp job", { jobId, invoiceId, stage, state });
        }
      }
    } catch (err) {
      log28.warn("Failed to cancel whatsapp job", {
        jobId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return cancelled;
}
var log28;
var init_whatsapp_queue = __esm({
  "src/modules/queues/whatsapp-queue.ts"() {
    "use strict";
    init_queue();
    init_queue_names();
    init_logger();
    log28 = logger.child({ module: "whatsapp-queue" });
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
    log29.info("SMS job enqueued", {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      smsNumber: data.smsNumber
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Job already exists")) {
      log29.info("SMS job already exists (idempotent skip)", {
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
    log29.info("Delayed SMS job enqueued", {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      delayMs,
      scheduledFor: new Date(Date.now() + delayMs).toISOString()
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Job already exists")) {
      log29.info("Delayed SMS job already exists (idempotent skip)", {
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
          log29.info("Cancelled pending SMS job", { jobId, invoiceId, stage, state });
        }
      }
    } catch (err) {
      log29.warn("Failed to cancel SMS job", {
        jobId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return cancelled;
}
var log29;
var init_sms_queue = __esm({
  "src/modules/queues/sms-queue.ts"() {
    "use strict";
    init_queue();
    init_queue_names();
    init_logger();
    log29 = logger.child({ module: "sms-queue" });
  }
});

// src/server/index.ts
var server_exports = {};
__export(server_exports, {
  default: () => server_default
});
module.exports = __toCommonJS(server_exports);
var import_config = require("dotenv/config");
var import_express12 = __toESM(require("express"));
var import_cors = __toESM(require("cors"));
var import_helmet = __toESM(require("helmet"));
var import_cookie_parser = __toESM(require("cookie-parser"));

// src/server/routes/index.ts
var import_express11 = require("express");

// src/server/routes/client.routes.ts
var import_express = require("express");

// src/lib/prisma.ts
var import_client = require("@prisma/client");
var import_adapter_pg = require("@prisma/adapter-pg");
var import_pg = __toESM(require("pg"));
var globalForPrisma = globalThis;
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
var prisma = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// src/lib/validation.ts
var import_zod = require("zod");
var loginSchema = import_zod.z.object({
  email: import_zod.z.string().email("Invalid email address").max(255),
  password: import_zod.z.string().min(1, "Password is required").max(128)
});
var registerSchema = import_zod.z.object({
  email: import_zod.z.string().email("Invalid email address").max(255),
  password: import_zod.z.string().min(8, "Password must be at least 8 characters").max(128, "Password must be at most 128 characters").regex(/[a-z]/, "Password must contain at least one lowercase letter").regex(/[A-Z]/, "Password must contain at least one uppercase letter").regex(/[0-9]/, "Password must contain at least one number"),
  name: import_zod.z.string().max(100).optional().nullable()
});
var createClientSchema = import_zod.z.object({
  name: import_zod.z.string().min(1, "Name is required").max(200),
  email: import_zod.z.string().email("Invalid email address").max(255),
  whatsappNumber: import_zod.z.string().max(20).optional().nullable(),
  smsNumber: import_zod.z.string().max(20).optional().nullable(),
  chasingProfile: import_zod.z.enum(["STRICT", "NORMAL", "RELAXED"]).optional(),
  contactChannel: import_zod.z.enum(["EMAIL", "WHATSAPP", "SMS", "BOTH", "EMAIL_AND_SMS", "ALL"]).optional()
});
var updateClientSchema = import_zod.z.object({
  name: import_zod.z.string().min(1).max(200).optional(),
  email: import_zod.z.string().email("Invalid email").max(255).optional(),
  whatsappNumber: import_zod.z.string().max(20).optional().nullable(),
  smsNumber: import_zod.z.string().max(20).optional().nullable(),
  chasingProfile: import_zod.z.enum(["STRICT", "NORMAL", "RELAXED"]).optional(),
  contactChannel: import_zod.z.enum(["EMAIL", "WHATSAPP", "SMS", "BOTH", "EMAIL_AND_SMS", "ALL"]).optional()
}).refine((data) => Object.values(data).some((v) => v !== void 0), {
  message: "At least one field must be provided"
});
var createInvoiceSchema = import_zod.z.object({
  clientName: import_zod.z.string().min(1, "Client name is required").max(200),
  clientEmail: import_zod.z.string().email("Invalid client email").max(255),
  amount: import_zod.z.union([import_zod.z.string(), import_zod.z.number()]).transform((val) => {
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) throw new Error("Invalid amount");
    return num;
  }).pipe(import_zod.z.number().positive("Amount must be positive").max(99999999999e-2, "Amount too large")),
  dueDate: import_zod.z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, "Invalid date format"),
  description: import_zod.z.string().max(2e3).optional().nullable(),
  clientId: import_zod.z.string().optional().nullable(),
  whatsappNumber: import_zod.z.string().max(20).optional().nullable(),
  smsNumber: import_zod.z.string().max(20).optional().nullable(),
  chasingProfile: import_zod.z.enum(["STRICT", "NORMAL", "RELAXED"]).optional(),
  contactChannel: import_zod.z.enum(["EMAIL", "WHATSAPP", "SMS", "BOTH", "EMAIL_AND_SMS", "ALL"]).optional()
});
var updateInvoiceSchema = import_zod.z.object({
  clientName: import_zod.z.string().min(1).max(200).optional(),
  clientEmail: import_zod.z.string().email("Invalid email").max(255).optional(),
  amount: import_zod.z.union([import_zod.z.string(), import_zod.z.number()]).transform((val) => {
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) throw new Error("Invalid amount");
    return num;
  }).pipe(import_zod.z.number().positive().max(99999999999e-2)).optional(),
  dueDate: import_zod.z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, "Invalid date").optional(),
  description: import_zod.z.string().max(2e3).optional().nullable(),
  status: import_zod.z.enum(["PAID", "UNPAID"]).optional()
}).refine((data) => Object.values(data).some((v) => v !== void 0), {
  message: "At least one field must be provided"
});
var paginationSchema = import_zod.z.object({
  page: import_zod.z.coerce.number().int().positive().default(1),
  limit: import_zod.z.coerce.number().int().min(1).max(100).default(20)
});
function validateBody(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstError = result.error.issues[0];
  const field = firstError?.path?.join(".") || "input";
  const message = firstError?.message || "Validation failed";
  return { success: false, error: `${field}: ${message}` };
}

// src/server/controllers/client.controller.ts
init_logger();
var log = logger.child({ module: "client-controller" });
async function getClients(req, res) {
  try {
    const pagination = validateBody(paginationSchema, req.query);
    if (!pagination.success) {
      res.status(400).json({ error: pagination.error });
      return;
    }
    const { page, limit } = pagination.data;
    const skip = (page - 1) * limit;
    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where: { userId: req.user.userId },
        include: {
          invoices: {
            select: { id: true, amount: true, status: true }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prisma.client.count({ where: { userId: req.user.userId } })
    ]);
    res.json({
      data: clients,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    log.error("Get clients error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
}
async function createClient(req, res) {
  try {
    const validation = validateBody(createClientSchema, req.body);
    if (!validation.success) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { name, email, whatsappNumber, smsNumber, chasingProfile, contactChannel } = validation.data;
    const existing = await prisma.client.findUnique({
      where: { userId_email: { userId: req.user.userId, email } }
    });
    if (existing) {
      res.status(409).json({ error: "A client with this email already exists" });
      return;
    }
    const client = await prisma.client.create({
      data: {
        userId: req.user.userId,
        name,
        email,
        whatsappNumber,
        smsNumber,
        chasingProfile,
        contactChannel
      }
    });
    log.info("Client created", { clientId: client.id, userId: req.user.userId });
    res.status(201).json(client);
  } catch (error) {
    log.error("Create client error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
}
async function getClient(req, res) {
  try {
    const id = req.params.id;
    const client = await prisma.client.findFirst({
      where: { id, userId: req.user.userId },
      include: { invoices: true }
    });
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.json(client);
  } catch (error) {
    log.error("Get client error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
}
async function updateClient(req, res) {
  try {
    const id = req.params.id;
    const existing = await prisma.client.findFirst({
      where: { id, userId: req.user.userId }
    });
    if (!existing) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const validation = validateBody(updateClientSchema, req.body);
    if (!validation.success) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const data = validation.data;
    const updateData = {};
    if (data.name !== void 0) updateData.name = data.name;
    if (data.email !== void 0) updateData.email = data.email;
    if (data.whatsappNumber !== void 0) updateData.whatsappNumber = data.whatsappNumber;
    if (data.smsNumber !== void 0) updateData.smsNumber = data.smsNumber;
    if (data.chasingProfile !== void 0) updateData.chasingProfile = data.chasingProfile;
    if (data.contactChannel !== void 0) updateData.contactChannel = data.contactChannel;
    const client = await prisma.client.update({
      where: { id },
      data: updateData
    });
    log.info("Client updated", { clientId: id });
    res.json(client);
  } catch (error) {
    log.error("Update client error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
}
async function deleteClient(req, res) {
  try {
    const id = req.params.id;
    const existing = await prisma.client.findFirst({
      where: { id, userId: req.user.userId }
    });
    if (!existing) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    await prisma.client.delete({ where: { id } });
    log.info("Client deleted", { clientId: id, userId: req.user.userId });
    res.json({ message: "Client deleted" });
  } catch (error) {
    log.error("Delete client error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
}

// src/lib/auth.ts
var jwt = __toESM(require("jsonwebtoken"));
init_logger();
var log2 = logger.child({ module: "auth" });
async function verifyToken(token) {
  try {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      log2.error("SUPABASE_JWT_SECRET is not set in environment variables");
      return null;
    }
    const decoded = jwt.verify(token, secret);
    if (!decoded || !decoded.sub) {
      log2.warn("Token missing sub (userId) claim");
      return null;
    }
    const userId = decoded.sub;
    const email = decoded.email || "";
    const role = decoded.role || "authenticated";
    await prisma.user.upsert({
      where: { id: userId },
      update: { email },
      // Ensure email stays in sync
      create: {
        id: userId,
        email
      }
    });
    return {
      userId,
      email,
      role
    };
  } catch (err) {
    log2.warn("Token verification failed", {
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
}

// src/server/middleware/auth.ts
init_logger();
var log3 = logger.child({ module: "auth-middleware" });
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const payload = await verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.user = payload;
  log3.info("Authenticated request", { userId: payload.userId, email: payload.email, path: req.path });
  log3.info("Authenticated user", { userId: payload.userId, email: payload.email });
  try {
    await prisma.user.upsert({
      where: { id: payload.userId },
      update: {},
      create: {
        id: payload.userId,
        email: payload.email
      }
    });
  } catch (err) {
    log3.error("Failed to upsert user", {
      userId: payload.userId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
  next();
}

// src/server/routes/client.routes.ts
var router = (0, import_express.Router)();
router.use(authMiddleware);
router.get("/", getClients);
router.post("/", createClient);
router.get("/:id", getClient);
router.put("/:id", updateClient);
router.delete("/:id", deleteClient);
var client_routes_default = router;

// src/server/routes/invoice.routes.ts
var import_express2 = require("express");

// src/server/controllers/invoice.controller.ts
init_logger();
var import_client4 = require("@prisma/client");

// src/modules/invoice/invoice.service.ts
init_logger();
var import_client3 = require("@prisma/client");
var log4 = logger.child({ module: "invoice-service" });
async function createInvoice(data) {
  return prisma.$transaction(async (tx) => {
    let clientId = data.clientId;
    if (!clientId) {
      const client = await tx.client.upsert({
        where: {
          userId_email: {
            userId: data.userId,
            email: data.clientEmail
          }
        },
        update: {
          name: data.clientName
        },
        create: {
          userId: data.userId,
          name: data.clientName,
          email: data.clientEmail
        }
      });
      clientId = client.id;
    }
    const invoice = await tx.invoice.create({
      data: {
        userId: data.userId,
        clientId: clientId || null,
        clientName: data.clientName,
        clientEmail: data.clientEmail,
        amount: new import_client3.Prisma.Decimal(data.amount.toFixed(2)),
        dueDate: data.dueDate,
        description: data.description || null,
        whatsappNumber: data.whatsappNumber || null,
        smsNumber: data.smsNumber || null,
        chasingProfile: data.chasingProfile || import_client3.ChasingProfile.NORMAL,
        contactChannel: data.contactChannel || import_client3.ContactChannel.EMAIL,
        reminderTone: data.reminderTone || "PROFESSIONAL",
        chaseUntilPaid: data.chaseUntilPaid || false,
        paymentLink: {
          create: {}
        }
      },
      include: {
        paymentLink: true
      }
    });
    const user = await tx.user.findUnique({
      where: { id: data.userId },
      select: { customIntervals: true }
    });
    log4.info("Invoice created", { invoiceId: invoice.id, userId: data.userId });
    const payload = {
      invoiceId: invoice.id,
      userId: invoice.userId,
      clientEmail: invoice.clientEmail,
      clientName: invoice.clientName,
      amount: invoice.amount.toString(),
      // Preserve decimal precision
      dueDate: invoice.dueDate,
      whatsappNumber: invoice.whatsappNumber,
      smsNumber: invoice.smsNumber,
      chasingProfile: invoice.chasingProfile,
      contactChannel: invoice.contactChannel,
      paymentLinkToken: invoice.paymentLink?.token,
      reminderTone: invoice.reminderTone,
      chaseUntilPaid: invoice.chaseUntilPaid,
      chaseIntervalDays: invoice.chaseIntervalDays,
      customIntervals: user?.customIntervals
    };
    await tx.outboxEvent.create({
      data: {
        eventType: "invoice.created",
        payload
      }
    });
    return invoice;
  });
}
async function markInvoiceAsPaid(invoiceId, userId) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.invoice.updateMany({
      where: {
        id: invoiceId,
        userId,
        status: "UNPAID"
      },
      data: {
        status: "PAID",
        reminderStage: 0,
        updatedAt: /* @__PURE__ */ new Date()
      }
    });
    if (result.count === 0) {
      log4.info("Invoice already paid or not found", { invoiceId, userId });
      return null;
    }
    log4.info("Invoice marked as paid", { invoiceId, userId });
    await tx.outboxEvent.create({
      data: {
        eventType: "invoice.paid",
        payload: { invoiceId, userId }
      }
    });
    return tx.invoice.findUnique({ where: { id: invoiceId } });
  });
}
async function markInvoiceAsUnpaid(invoiceId, userId) {
  const result = await prisma.invoice.updateMany({
    where: {
      id: invoiceId,
      userId,
      status: "PAID"
    },
    data: {
      status: "UNPAID"
      // Preserve reminderStage — don't restart from 0
    }
  });
  if (result.count === 0) {
    log4.info("Invoice already unpaid or not found", { invoiceId, userId });
    return null;
  }
  log4.info("Invoice marked as unpaid", { invoiceId, userId });
  return prisma.invoice.findUnique({ where: { id: invoiceId } });
}
async function deleteInvoice(invoiceId, userId) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, userId }
    });
    if (!invoice) {
      return null;
    }
    if (invoice.status === "UNPAID") {
      try {
        await tx.outboxEvent.create({
          data: {
            eventType: "invoice.paid",
            payload: { invoiceId, userId }
          }
        });
      } catch (err) {
        log4.error("Failed to write cleanup event to outbox before deletion", { invoiceId, error: err });
      }
    }
    await tx.invoice.delete({ where: { id: invoiceId } });
    log4.info("Invoice deleted with job cleanup", { invoiceId, userId });
    return invoice;
  });
}
async function getInvoices(userId, options) {
  const skip = (options.page - 1) * options.limit;
  let statusCondition = {};
  if (options.statusFilter === "PAID") {
    statusCondition = { status: "PAID" };
  } else if (options.statusFilter === "UNPAID") {
    statusCondition = { status: "UNPAID" };
  } else if (options.statusFilter === "OVERDUE") {
    statusCondition = {
      status: "UNPAID",
      dueDate: { lt: /* @__PURE__ */ new Date() }
    };
  } else if (options.statusFilter === "PENDING") {
    statusCondition = {
      status: "UNPAID",
      dueDate: { gte: /* @__PURE__ */ new Date() }
    };
  }
  const searchCondition = options.search ? {
    OR: [
      { clientName: { contains: options.search, mode: "insensitive" } },
      { clientEmail: { contains: options.search, mode: "insensitive" } }
    ]
  } : {};
  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where: { userId, ...statusCondition, ...searchCondition },
      orderBy: { createdAt: "desc" },
      skip,
      take: options.limit
    }),
    prisma.invoice.count({
      where: { userId, ...statusCondition, ...searchCondition }
    })
  ]);
  return { invoices, total };
}
async function getInvoiceById(id, userId) {
  return prisma.invoice.findFirst({
    where: { id, userId },
    include: {
      reminderLogs: {
        orderBy: { sentAt: "desc" },
        take: 10
      }
    }
  });
}
async function updateInvoiceDetails(id, userId, updateData) {
  return prisma.invoice.update({
    where: { id },
    data: updateData
  });
}
async function sendManualReminder(invoiceId, userId) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, userId },
      include: { paymentLink: true }
    });
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "PAID") throw new Error("Cannot send reminder for a paid invoice");
    const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / (1e3 * 60 * 60 * 24)));
    const nextStage = Math.max(1, invoice.reminderStage + 1);
    const payload = {
      invoiceId: invoice.id,
      userId: invoice.userId,
      clientEmail: invoice.clientEmail,
      clientName: invoice.clientName,
      amount: invoice.amount.toString(),
      dueDate: invoice.dueDate,
      daysOverdue,
      stage: nextStage,
      contactChannel: invoice.contactChannel,
      whatsappNumber: invoice.whatsappNumber,
      smsNumber: invoice.smsNumber,
      paymentLinkToken: invoice.paymentLink?.token,
      reminderTone: invoice.reminderTone,
      chaseUntilPaid: invoice.chaseUntilPaid,
      chaseIntervalDays: invoice.chaseIntervalDays
    };
    await tx.outboxEvent.create({
      data: {
        eventType: "invoice.overdue",
        payload
      }
    });
    await tx.invoiceEvent.create({
      data: {
        invoiceId,
        eventType: "manual_reminder_queued",
        metadata: { daysOverdue, stage: nextStage }
      }
    });
    log4.info("Manual reminder queued", { invoiceId, nextStage });
    return { success: true, channels: [], errors: [], message: "Reminder queued" };
  });
}
async function getReminderHistory(invoiceId, userId) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    select: { id: true }
  });
  if (!invoice) return null;
  const reminders = await prisma.reminderLog.findMany({
    where: { invoiceId },
    orderBy: { sentAt: "desc" }
  });
  const trackings = await prisma.invoiceTracking.findMany({
    where: { invoiceId },
    orderBy: { createdAt: "desc" }
  });
  const events = await prisma.invoiceEvent.findMany({
    where: {
      invoiceId,
      eventType: {
        notIn: ["email_opened", "link_clicked", "payment_page_viewed"]
      }
    },
    orderBy: { createdAt: "desc" }
  });
  const unifiedHistory = [];
  reminders.forEach((r) => unifiedHistory.push({ ...r, _type: "reminder", _date: r.sentAt }));
  trackings.forEach((t) => unifiedHistory.push({ ...t, _type: "tracking", _date: t.createdAt }));
  events.forEach((e) => unifiedHistory.push({ ...e, _type: "event", _date: e.createdAt }));
  unifiedHistory.sort((a, b) => b._date.getTime() - a._date.getTime());
  return unifiedHistory;
}

// src/server/controllers/invoice.controller.ts
var log5 = logger.child({ module: "invoice-controller" });
async function getInvoices2(req, res) {
  try {
    const pagination = validateBody(paginationSchema, req.query);
    if (!pagination.success) {
      res.status(400).json({ error: pagination.error });
      return;
    }
    const { page, limit } = pagination.data;
    const statusFilter = req.query.status?.toUpperCase();
    const search = req.query.search;
    const { invoices, total } = await getInvoices(req.user.userId, {
      page,
      limit,
      statusFilter,
      search
    });
    res.json({
      data: invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    log5.error("Get invoices error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
}
async function createInvoiceHandler(req, res) {
  try {
    const validation = validateBody(createInvoiceSchema, req.body);
    if (!validation.success) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const { clientName, clientEmail, amount, dueDate, description, clientId } = validation.data;
    let finalWhatsapp = validation.data.whatsappNumber || null;
    let finalSms = validation.data.smsNumber || null;
    let finalChasing = validation.data.chasingProfile || "NORMAL";
    let finalContact = validation.data.contactChannel || "EMAIL";
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (client) {
        finalWhatsapp = client.whatsappNumber;
        finalSms = client.smsNumber;
        finalChasing = client.chasingProfile;
        finalContact = client.contactChannel;
      }
    }
    const invoice = await createInvoice({
      userId: req.user.userId,
      clientId: clientId ? String(clientId) : null,
      clientName,
      clientEmail,
      amount,
      dueDate: new Date(dueDate),
      description: description || null,
      whatsappNumber: finalWhatsapp,
      smsNumber: finalSms,
      chasingProfile: finalChasing,
      contactChannel: finalContact
    });
    res.status(201).json(invoice);
  } catch (error) {
    log5.error("Create invoice error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
}
async function getInvoice(req, res) {
  try {
    const id = req.params.id;
    const invoice = await getInvoiceById(id, req.user.userId);
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    res.json(invoice);
  } catch (error) {
    log5.error("Get invoice error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
}
async function updateInvoice(req, res) {
  try {
    const id = req.params.id;
    const existing = await getInvoiceById(id, req.user.userId);
    if (!existing) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    const validation = validateBody(updateInvoiceSchema, req.body);
    if (!validation.success) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const data = validation.data;
    if (data.status !== void 0 && data.status !== existing.status) {
      if (data.status === "PAID") {
        const paidInvoice = await markInvoiceAsPaid(id, req.user.userId);
        if (!paidInvoice) {
          res.status(409).json({ error: "Invoice already paid" });
          return;
        }
        const otherUpdates = {};
        if (data.clientName !== void 0) otherUpdates.clientName = data.clientName;
        if (data.clientEmail !== void 0) otherUpdates.clientEmail = data.clientEmail;
        if (data.amount !== void 0) otherUpdates.amount = new import_client4.Prisma.Decimal(data.amount.toFixed(2));
        if (data.dueDate !== void 0) otherUpdates.dueDate = new Date(data.dueDate);
        if (data.description !== void 0) otherUpdates.description = data.description;
        if (Object.keys(otherUpdates).length > 0) {
          const invoice = await updateInvoiceDetails(id, req.user.userId, otherUpdates);
          res.json(invoice);
          return;
        }
        res.json(paidInvoice);
        return;
      }
      if (data.status === "UNPAID") {
        const unpaidInvoice = await markInvoiceAsUnpaid(id, req.user.userId);
        if (!unpaidInvoice) {
          res.status(409).json({ error: "Invoice already unpaid or not found" });
          return;
        }
      }
    }
    const updateData = {};
    if (data.clientName !== void 0) updateData.clientName = data.clientName;
    if (data.clientEmail !== void 0) updateData.clientEmail = data.clientEmail;
    if (data.amount !== void 0) updateData.amount = new import_client4.Prisma.Decimal(data.amount.toFixed(2));
    if (data.dueDate !== void 0) updateData.dueDate = new Date(data.dueDate);
    if (data.description !== void 0) updateData.description = data.description;
    if (data.status !== void 0) updateData.status = data.status;
    if (Object.keys(updateData).length > 0) {
      const invoice = await updateInvoiceDetails(id, req.user.userId, updateData);
      log5.info("Invoice updated", { invoiceId: id, changes: Object.keys(updateData) });
      res.json(invoice);
      return;
    }
    res.json(existing);
  } catch (error) {
    log5.error("Update invoice error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
}
async function deleteInvoiceHandler(req, res) {
  try {
    const id = req.params.id;
    const deleted = await deleteInvoice(id, req.user.userId);
    if (!deleted) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    res.json({ message: "Invoice deleted" });
  } catch (error) {
    log5.error("Delete invoice error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
}
async function sendReminderHandler(req, res) {
  try {
    const id = req.params.id;
    const result = await sendManualReminder(id, req.user.userId);
    if (!result.success) {
      res.status(500).json({
        error: "Failed to queue reminder",
        details: result.errors
      });
      return;
    }
    res.status(202).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    log5.error("Send reminder error", { error: message });
    if (message === "Invoice not found") {
      res.status(404).json({ error: message });
      return;
    }
    if (message.includes("paid invoice")) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
}
async function getReminderHistoryHandler(req, res) {
  try {
    const id = req.params.id;
    const history = await getReminderHistory(id, req.user.userId);
    if (history === null) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    res.json({ data: history });
  } catch (error) {
    log5.error("Get reminder history error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
}

// src/server/routes/invoice.routes.ts
var router2 = (0, import_express2.Router)();
router2.use(authMiddleware);
router2.get("/", getInvoices2);
router2.post("/", createInvoiceHandler);
router2.get("/:id", getInvoice);
router2.put("/:id", updateInvoice);
router2.delete("/:id", deleteInvoiceHandler);
router2.post("/:id/remind", sendReminderHandler);
router2.get("/:id/history", getReminderHistoryHandler);
var invoice_routes_default = router2;

// src/server/routes/dashboard.routes.ts
var import_express3 = require("express");

// src/server/controllers/dashboard.controller.ts
init_logger();
var log6 = logger.child({ module: "dashboard-controller" });
async function getDashboard(req, res) {
  try {
    const now = /* @__PURE__ */ new Date();
    const [
      paidInvoices,
      unpaidInvoices,
      overdueInvoices,
      totalPendingResult,
      totalCollectedResult,
      recentInvoices
    ] = await Promise.all([
      prisma.invoice.count({
        where: { userId: req.user.userId, status: "PAID" }
      }),
      prisma.invoice.count({
        where: { userId: req.user.userId, status: "UNPAID" }
      }),
      prisma.invoice.count({
        where: { userId: req.user.userId, status: "UNPAID", dueDate: { lt: now } }
      }),
      prisma.invoice.aggregate({
        where: { userId: req.user.userId, status: "UNPAID" },
        _sum: { amount: true }
      }),
      prisma.invoice.aggregate({
        where: { userId: req.user.userId, status: "PAID" },
        _sum: { amount: true }
      }),
      prisma.invoice.findMany({
        where: { userId: req.user.userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          clientName: true,
          amount: true,
          dueDate: true,
          status: true,
          aiMetadata: {
            select: { riskScore: true }
          }
        }
      })
    ]);
    const dueInvoices = unpaidInvoices - overdueInvoices;
    const toNumber = (val) => val ? parseFloat(val.toString()) : 0;
    const totalPendingAmount = toNumber(totalPendingResult._sum.amount);
    const totalCollectedAmount = toNumber(totalCollectedResult._sum.amount);
    log6.info("Dashboard query result", {
      userId: req.user.userId,
      paidInvoices,
      dueInvoices: unpaidInvoices - overdueInvoices,
      overdueInvoices,
      recentCount: recentInvoices.length,
      recentIds: recentInvoices.map((i) => ({ id: i.id, client: i.clientName }))
    });
    res.json({
      paidInvoices,
      dueInvoices,
      overdueInvoices,
      totalPendingAmount,
      totalCollectedAmount,
      recentInvoices
    });
  } catch (error) {
    log6.error("Dashboard error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Internal server error" });
  }
}

// src/server/routes/dashboard.routes.ts
var router3 = (0, import_express3.Router)();
router3.get("/", authMiddleware, getDashboard);
var dashboard_routes_default = router3;

// src/server/routes/settings.routes.ts
var import_express4 = require("express");

// src/modules/communication/google-oauth.ts
var import_googleapis = require("googleapis");

// src/lib/encryption.ts
var import_crypto = require("crypto");
init_logger();
var log7 = logger.child({ module: "encryption" });
var ALGORITHM = "aes-256-gcm";
var IV_LENGTH = 16;
var TAG_LENGTH = 16;
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 64) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY must be a 64-character hex string in production");
    }
    log7.warn("Using weak ENCRYPTION_KEY \u2014 set a strong key before deploying");
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

// src/modules/communication/google-oauth.ts
init_logger();
var log8 = logger.child({ module: "google-oauth" });
var SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email"
];
function getOAuth2Client() {
  return new import_googleapis.google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}
function getAuthorizationUrl(userId) {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    // Always show consent to get refresh token
    state: userId
    // Pass userId to identify user in callback
  });
}
async function handleOAuthCallback(code, userId) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) {
    throw new Error("No access token received from Google");
  }
  client.setCredentials(tokens);
  const oauth2 = import_googleapis.google.oauth2({ version: "v2", auth: client });
  const userInfo = await oauth2.userinfo.get();
  const email = userInfo.data.email || "";
  await prisma.userCredential.upsert({
    where: { userId_provider: { userId, provider: "google_oauth" } },
    update: {
      accessToken: encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : void 0,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      metadata: { email, scope: tokens.scope },
      updatedAt: /* @__PURE__ */ new Date()
    },
    create: {
      userId,
      provider: "google_oauth",
      accessToken: encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      metadata: { email, scope: tokens.scope }
    }
  });
  log8.info("Google OAuth connected", { userId, email });
  return { email };
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
      log8.info("Google OAuth tokens refreshed", { userId });
    } catch (err) {
      log8.error("Failed to save refreshed tokens", {
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
    log8.info("Email sent via Gmail", { userId, to, subject });
    return true;
  } catch (err) {
    log8.error("Gmail send failed", {
      userId,
      to,
      error: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
}
async function disconnectGoogle(userId) {
  const credential = await prisma.userCredential.findUnique({
    where: { userId_provider: { userId, provider: "google_oauth" } }
  });
  if (credential) {
    try {
      const client = getOAuth2Client();
      const accessToken = decrypt(credential.accessToken);
      await client.revokeToken(accessToken);
    } catch {
    }
    await prisma.userCredential.delete({
      where: { userId_provider: { userId, provider: "google_oauth" } }
    });
    log8.info("Google OAuth disconnected", { userId });
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

// src/modules/communication/sms-sender.ts
var import_twilio = __toESM(require("twilio"));
init_logger();
var log9 = logger.child({ module: "sms-sender" });
async function connectTwilio(userId, accountSid, authToken, phoneNumber) {
  try {
    const client = (0, import_twilio.default)(accountSid, authToken);
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
  log9.info("Twilio connected", { userId, phoneNumber });
  return { success: true };
}
async function disconnectTwilio(userId) {
  await prisma.userCredential.deleteMany({
    where: { userId, provider: "twilio" }
  });
  log9.info("Twilio disconnected", { userId });
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

// src/server/controllers/settings.controller.ts
init_logger();
var log10 = logger.child({ module: "settings-controller" });
async function getConnectionStatus(req, res) {
  try {
    const userId = req.user.userId;
    const [google2, twilio] = await Promise.all([
      isGoogleConnected(userId),
      isTwilioConnected(userId)
    ]);
    res.json({ google: google2, twilio });
  } catch (error) {
    log10.error("Failed to get connection status", {
      userId: req.user.userId,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ error: "Failed to get connection status" });
  }
}
async function getPreferences(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { customIntervals: true, chaseIntervalDays: true, chaseUntilPaid: true }
    });
    res.json(user);
  } catch (error) {
    log10.error("Failed to get preferences", {
      userId: req.user.userId,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ error: "Failed to get preferences" });
  }
}
async function updatePreferences(req, res) {
  try {
    const { customIntervals, chaseIntervalDays, chaseUntilPaid } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { customIntervals, chaseIntervalDays, chaseUntilPaid },
      select: { customIntervals: true, chaseIntervalDays: true, chaseUntilPaid: true }
    });
    res.json(user);
  } catch (error) {
    log10.error("Failed to update preferences", {
      userId: req.user.userId,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ error: "Failed to update preferences" });
  }
}
async function getEmailAuthUrl(req, res) {
  try {
    const url = getAuthorizationUrl(req.user.userId);
    res.json({ url });
  } catch (error) {
    log10.error("Failed to generate auth url", {
      userId: req.user.userId,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ error: "Failed to generate authorization URL" });
  }
}
async function connectEmail(req, res) {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: "Authorization code is required" });
      return;
    }
    const { email } = await handleOAuthCallback(code, req.user.userId);
    res.json({
      success: true,
      message: "Email connected successfully",
      email
    });
  } catch (error) {
    log10.error("OAuth callback failed", {
      userId: req.user.userId,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ error: "Failed to connect email account" });
  }
}
async function disconnectEmail(req, res) {
  try {
    await disconnectGoogle(req.user.userId);
    res.json({ success: true, message: "Email disconnected successfully" });
  } catch (error) {
    log10.error("Failed to disconnect Google OAuth", {
      userId: req.user.userId,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ error: "Failed to disconnect email account" });
  }
}
async function connectSms(req, res) {
  try {
    const { accountSid, authToken, phoneNumber } = req.body;
    if (!accountSid || !authToken || !phoneNumber) {
      res.status(400).json({ error: "Missing required API credentials" });
      return;
    }
    const result = await connectTwilio(req.user.userId, accountSid, authToken, phoneNumber);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({
      success: true,
      message: "Twilio connected successfully"
    });
  } catch (error) {
    log10.error("Twilio connect failed", {
      userId: req.user.userId,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ error: "Failed to connect Twilio account" });
  }
}
async function disconnectSms(req, res) {
  try {
    await disconnectTwilio(req.user.userId);
    res.json({ success: true, message: "Twilio disconnected successfully" });
  } catch (error) {
    log10.error("Failed to disconnect Twilio", {
      userId: req.user.userId,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({ error: "Failed to disconnect Twilio account" });
  }
}
async function googleOAuthCallback(req, res) {
  const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    const code = req.query.code;
    const userId = req.query.state;
    if (!code || !userId) {
      res.redirect(`${frontendUrl}/settings?error=missing_params`);
      return;
    }
    const { email } = await handleOAuthCallback(code, userId);
    log10.info("Google OAuth callback successful", { userId, email });
    res.redirect(`${frontendUrl}/settings?google_connected=true&email=${encodeURIComponent(email)}`);
  } catch (error) {
    log10.error("Google OAuth callback failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    res.redirect(`${frontendUrl}/settings?error=oauth_failed`);
  }
}

// src/server/routes/settings.routes.ts
var router4 = (0, import_express4.Router)();
router4.get("/google/callback", googleOAuthCallback);
router4.use(authMiddleware);
router4.get("/status", getConnectionStatus);
router4.get("/preferences", getPreferences);
router4.put("/preferences", updatePreferences);
router4.get("/email/connect", getEmailAuthUrl);
router4.post("/email/connect", connectEmail);
router4.delete("/email/disconnect", disconnectEmail);
router4.post("/sms/connect", connectSms);
router4.delete("/sms/disconnect", disconnectSms);
var settings_routes_default = router4;

// src/server/routes/admin.routes.ts
var import_express5 = require("express");

// src/lib/settings.ts
var cache = /* @__PURE__ */ new Map();
var CACHE_TTL_MS = 60 * 1e3;
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
async function setSetting(key, value) {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// src/server/controllers/admin.controller.ts
init_logger();
var log11 = logger.child({ module: "admin-controller" });
async function getSettings(_req, res) {
  try {
    const apiKey = await getSetting("GEMINI_API_KEY", "");
    const parserModel = await getSetting("GEMINI_PARSER_MODEL", "gemini-1.5-flash");
    const generatorModel = await getSetting("GEMINI_GENERATOR_MODEL", "gemini-2.0-flash");
    res.json({ apiKey, parserModel, generatorModel });
  } catch (error) {
    log11.error("Get settings error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Failed to fetch settings" });
  }
}
async function updateSettings(req, res) {
  try {
    const body = req.body;
    if (typeof body.apiKey === "string") {
      await setSetting("GEMINI_API_KEY", body.apiKey);
    }
    if (typeof body.parserModel === "string" && body.parserModel) {
      await setSetting("GEMINI_PARSER_MODEL", body.parserModel);
    }
    if (typeof body.generatorModel === "string" && body.generatorModel) {
      await setSetting("GEMINI_GENERATOR_MODEL", body.generatorModel);
    }
    res.json({ success: true });
  } catch (error) {
    log11.error("Update settings error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Failed to update settings" });
  }
}
async function listModels(req, res) {
  try {
    const { apiKey } = req.body;
    const keyToUse = apiKey || await getSetting("GEMINI_API_KEY");
    if (!keyToUse) {
      res.status(400).json({ error: "No API Key provided or configured." });
      return;
    }
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${keyToUse}`);
    if (!response.ok) {
      throw new Error("Invalid API Key or connection error");
    }
    const data = await response.json();
    const validModels = (data.models || []).filter((model) => model.name.includes("gemini")).map((model) => ({
      id: model.name.replace("models/", ""),
      displayName: model.displayName,
      description: model.description
    }));
    res.json({ success: true, models: validModels });
  } catch (error) {
    log11.error("List models error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Failed to authenticate and detect models" });
  }
}
async function listUsers(req, res) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionTier: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, users });
  } catch (error) {
    log11.error("List users error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Failed to list users" });
  }
}
async function updateUserTier(req, res) {
  try {
    const { id } = req.params;
    const { tier } = req.body;
    if (tier !== "FREE" && tier !== "PRO") {
      res.status(400).json({ error: "Invalid tier. Must be FREE or PRO." });
      return;
    }
    await prisma.user.update({
      where: { id },
      data: { subscriptionTier: tier }
    });
    res.json({ success: true });
  } catch (error) {
    log11.error("Update user tier error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Failed to update user tier" });
  }
}

// src/server/middleware/admin.ts
init_logger();
var log12 = logger.child({ module: "admin-middleware" });
function adminMiddleware(req, res, next) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    log12.error("ADMIN_API_KEY is not configured");
    res.status(500).json({ error: "Admin access not configured" });
    return;
  }
  const providedKey = req.headers["x-admin-key"];
  if (!providedKey || providedKey !== adminKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// src/server/routes/admin.routes.ts
var router5 = (0, import_express5.Router)();
router5.use(adminMiddleware);
router5.get("/settings", getSettings);
router5.post("/settings", updateSettings);
router5.post("/settings/models", listModels);
router5.get("/users", listUsers);
router5.post("/users/:id/tier", updateUserTier);
var admin_routes_default = router5;

// src/server/routes/payment.routes.ts
var import_express6 = require("express");

// src/modules/communication/email-sender.ts
var import_nodemailer = __toESM(require("nodemailer"));
init_logger();
var log13 = logger.child({ module: "email-sender" });
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
        log13.info("Email sent via Gmail", { userId, to, subject });
        return { success: true, channel: "gmail" };
      }
    } catch (err) {
      log13.warn("Gmail send failed, falling back to SMTP", {
        userId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  try {
    await sendViaSMTP(to, subject, finalHtml, options.plainText);
    log13.info("Email sent via SMTP", { userId, to, subject });
    return { success: true, channel: "smtp" };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log13.error("SMTP send failed", { userId, to, error: errorMsg });
    return { success: false, channel: "smtp", error: errorMsg };
  }
}
var transporter = null;
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

// src/modules/payment/payment.service.ts
init_logger();
var log14 = logger.child({ module: "payment-service" });
async function getPaymentLinkAndTrackView(token) {
  const paymentLink = await prisma.paymentLink.findUnique({
    where: { token },
    include: {
      invoice: {
        include: {
          user: {
            select: { name: true, email: true }
          }
        }
      }
    }
  });
  if (!paymentLink || !paymentLink.isActive) {
    return null;
  }
  Promise.resolve().then(async () => {
    try {
      const invoice = paymentLink.invoice;
      await prisma.invoiceTracking.create({
        data: {
          invoiceId: invoice.id,
          event: "payment_page_viewed",
          metadata: { token }
        }
      });
      await prisma.invoiceEvent.create({
        data: {
          invoiceId: invoice.id,
          eventType: "link_clicked"
        }
      });
      await prisma.paymentLink.update({
        where: { id: paymentLink.id },
        data: {
          clickCount: { increment: 1 },
          lastClickAt: /* @__PURE__ */ new Date()
        }
      });
    } catch (err) {
      log14.error("Failed to track payment page view", { token });
    }
  });
  return paymentLink;
}
async function processPaymentNotification(token) {
  const paymentLink = await prisma.paymentLink.findUnique({
    where: { token },
    include: {
      invoice: {
        include: {
          user: true
        }
      }
    }
  });
  if (!paymentLink || !paymentLink.isActive) {
    throw new Error("Invalid or expired payment link");
  }
  const { invoice } = paymentLink;
  if (invoice.status === "PAID") {
    throw new Error("Invoice is already paid");
  }
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: invoice.id,
      eventType: "client_notified_paid"
    }
  });
  const freelancerEmail = invoice.user.email;
  const subject = `\u{1F389} Client payment notification for Invoice ${invoice.invoiceNumber || "N/A"}`;
  const htmlBody = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2>Payment Notification</h2>
      <p><strong>${invoice.clientName}</strong> has just indicated they've paid invoice <strong>${invoice.invoiceNumber || "N/A"}</strong> for <strong>$${invoice.amount.toNumber().toLocaleString()}</strong>.</p>
      <p>Please check your accounts to confirm receipt.</p>
      <p>If you've received the funds, log into Invoice Chaser and mark the invoice as PAID to stop automated reminders.</p>
    </div>
  `;
  await sendEmail({
    userId: invoice.userId,
    to: freelancerEmail,
    subject,
    htmlBody,
    plainText: `${invoice.clientName} indicated they paid invoice ${invoice.invoiceNumber}. Please verify and mark as paid in the dashboard.`
  });
  log14.info("Client notified paid", { invoiceId: invoice.id, token });
  return { success: true, invoiceId: invoice.id };
}

// src/server/controllers/payment.controller.ts
init_logger();
var log15 = logger.child({ module: "payment-controller" });
async function getPaymentLink(req, res) {
  try {
    const token = req.params.token;
    const paymentLink = await getPaymentLinkAndTrackView(token);
    if (!paymentLink) {
      res.status(404).json({ error: "Invalid or expired payment link" });
      return;
    }
    const { invoice } = paymentLink;
    res.json({
      id: invoice.id,
      number: invoice.invoiceNumber || "N/A",
      amount: invoice.amount,
      dueDate: invoice.dueDate,
      description: invoice.description,
      clientName: invoice.clientName,
      status: invoice.status,
      user: invoice.user
    });
  } catch (err) {
    log15.error("Failed to get payment link", {
      error: err instanceof Error ? err.message : String(err)
    });
    res.status(500).json({ error: "Internal server error" });
  }
}
async function notifyPayment(req, res) {
  try {
    const token = req.params.token;
    const result = await processPaymentNotification(token);
    res.json(result);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage === "Invalid or expired payment link") {
      res.status(404).json({ error: errorMessage });
      return;
    }
    if (errorMessage === "Invoice is already paid") {
      res.status(400).json({ error: errorMessage });
      return;
    }
    log15.error("Failed to process payment notification", { error: errorMessage });
    res.status(500).json({ error: "Internal server error" });
  }
}

// src/server/routes/payment.routes.ts
var router6 = (0, import_express6.Router)();
router6.get("/:token", getPaymentLink);
router6.post("/:token/notify", notifyPayment);
var payment_routes_default = router6;

// src/server/routes/tracking.routes.ts
var import_express7 = require("express");

// src/server/controllers/tracking.controller.ts
init_logger();
var log16 = logger.child({ module: "tracking-controller" });
var TRANSPARENT_GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
var pixelBuffer = Buffer.from(TRANSPARENT_GIF_BASE64, "base64");
async function trackEmailOpen(req, res) {
  const invoiceId = req.query.invoice;
  const stage = req.query.stage;
  if (invoiceId) {
    try {
      trackOpen(invoiceId, stage, req).catch((err) => {
        log16.error("Failed to log tracking event", {
          invoiceId,
          error: err instanceof Error ? err.message : String(err)
        });
      });
    } catch {
    }
  }
  res.set("Content-Type", "image/gif").set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0").set("Pragma", "no-cache").set("Expires", "0").send(pixelBuffer);
}
async function trackOpen(invoiceId, stage, req) {
  const userAgent = req.headers["user-agent"] || "unknown";
  const ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.ip || "unknown";
  await prisma.invoiceTracking.create({
    data: {
      invoiceId,
      event: "email_opened",
      channel: "email",
      metadata: {
        stage: stage ? parseInt(stage) : null,
        userAgent,
        ip
      }
    }
  });
  await prisma.invoiceEvent.create({
    data: {
      invoiceId,
      eventType: "email_opened",
      metadata: { stage: stage ? parseInt(stage) : null, channel: "email" }
    }
  });
  log16.info("Email open tracked", { invoiceId, stage });
}

// src/server/routes/tracking.routes.ts
var router7 = (0, import_express7.Router)();
router7.get("/email", trackEmailOpen);
var tracking_routes_default = router7;

// src/server/routes/upload.routes.ts
var import_express8 = require("express");
var import_multer = __toESM(require("multer"));

// src/modules/ai/parser.ts
var import_generative_ai = require("@google/generative-ai");
init_logger();
var log17 = logger.child({ module: "ai-parser" });
var invoiceSchema = {
  type: "OBJECT",
  properties: {
    clientName: {
      type: "STRING",
      description: "The name of the client being billed."
    },
    clientEmail: {
      type: "STRING",
      description: "The email address of the client."
    },
    amount: {
      type: "NUMBER",
      description: "The total amount due."
    },
    dueDate: {
      type: "STRING",
      description: "The due date of the invoice in ISO format (YYYY-MM-DD). Calculate from terms if only issue date and terms (e.g. Net 30) are provided."
    },
    description: {
      type: "STRING",
      description: "A short description of the services or goods provided."
    },
    confidenceScore: {
      type: "NUMBER",
      description: "A score from 0 to 100 indicating how confident you are in the extracted data. Deduct points for missing or ambiguous fields."
    }
  },
  required: ["clientName", "clientEmail", "amount", "dueDate", "confidenceScore"]
};
async function parseInvoiceContent(textContent) {
  try {
    const apiKey = await getSetting("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined in system settings.");
    }
    const genAI = new import_generative_ai.GoogleGenerativeAI(apiKey);
    const parserModel = await getSetting("GEMINI_PARSER_MODEL", "gemini-1.5-flash");
    const model = genAI.getGenerativeModel({
      model: parserModel,
      // fast and structured
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: invoiceSchema,
        temperature: 0.1
      }
    });
    const prompt = `You are an expert accounting assistant. Extract the invoice details from the following raw text extracted from a document.
If a field is completely missing (like an email), make your best educated guess or provide a placeholder like 'unknown@example.com' if absolutely necessary, but lower the confidenceScore.

Raw Text:
"""
${textContent.substring(0, 5e3)} // limit to 5000 chars to avoid token limits on huge CSVs
"""`;
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    const parsed = JSON.parse(text);
    if (parsed.dueDate) {
      try {
        const d = new Date(parsed.dueDate);
        if (!isNaN(d.getTime())) {
          parsed.dueDate = d.toISOString().split("T")[0];
        }
      } catch (e) {
      }
    }
    log17.info("Successfully parsed invoice", { confidenceScore: parsed.confidenceScore });
    return parsed;
  } catch (error) {
    log17.error("Failed to parse invoice with AI", { error: error instanceof Error ? error.message : String(error) });
    throw new Error("Failed to extract invoice data");
  }
}

// src/server/controllers/upload.controller.ts
init_logger();
var import_sync = require("csv-parse/sync");
var pdf = require("pdf-parse");
var log18 = logger.child({ module: "upload-controller" });
async function uploadFile(req, res) {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    log18.info("Received file for parsing", {
      filename: file.originalname,
      size: file.size,
      type: file.mimetype
    });
    const buffer = file.buffer;
    let extractedText = "";
    if (file.mimetype === "application/pdf" || file.originalname.endsWith(".pdf")) {
      const data = await pdf(buffer);
      extractedText = data.text;
    } else if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      const records = (0, import_sync.parse)(buffer, {
        columns: true,
        skip_empty_lines: true
      });
      extractedText = records.map((r) => JSON.stringify(r)).join("\n");
    } else if (file.mimetype === "application/json" || file.originalname.endsWith(".json")) {
      extractedText = buffer.toString("utf-8");
    } else {
      extractedText = buffer.toString("utf-8");
    }
    if (!extractedText || extractedText.trim().length === 0) {
      res.status(400).json({ error: "Could not extract text from file" });
      return;
    }
    const parsedData = await parseInvoiceContent(extractedText);
    res.json({ success: true, data: parsedData });
  } catch (error) {
    log18.error("Upload processing failed", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Failed to process file. Please try manual entry." });
  }
}

// src/server/routes/upload.routes.ts
var router8 = (0, import_express8.Router)();
var upload = (0, import_multer.default)({
  storage: import_multer.default.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});
router8.post("/", authMiddleware, upload.single("file"), uploadFile);
var upload_routes_default = router8;

// src/server/routes/health.routes.ts
var import_express9 = require("express");

// src/server/controllers/health.controller.ts
init_redis();
init_logger();
var log20 = logger.child({ module: "health-controller" });
async function getHealth(_req, res) {
  const start = Date.now();
  try {
    const [dbResult, redisResult] = await Promise.allSettled([
      (async () => {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        return { status: "up", latencyMs: Date.now() - dbStart };
      })(),
      checkRedisHealth()
    ]);
    const dbHealth = dbResult.status === "fulfilled" ? dbResult.value : { status: "down", latencyMs: 0 };
    const redisHealth = redisResult.status === "fulfilled" ? redisResult.value : { status: "down", latencyMs: 0 };
    const overallStatus = dbHealth.status === "up" && redisHealth.status === "up" ? "healthy" : "degraded";
    res.status(overallStatus === "healthy" ? 200 : 503).json({
      status: overallStatus,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      version: process.env.npm_package_version || "0.1.0",
      totalLatencyMs: Date.now() - start,
      checks: {
        database: dbHealth,
        redis: redisHealth
      }
    });
  } catch (error) {
    log20.error("Health check failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(503).json({
      status: "unhealthy",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      checks: {
        database: { status: "down" },
        redis: { status: "down" }
      }
    });
  }
}

// src/server/routes/health.routes.ts
var router9 = (0, import_express9.Router)();
router9.get("/", getHealth);
var health_routes_default = router9;

// src/server/routes/billing.routes.ts
var import_express10 = require("express");

// src/server/controllers/billing.controller.ts
var import_lemonsqueezy = require("@lemonsqueezy/lemonsqueezy.js");
init_logger();
var import_crypto2 = __toESM(require("crypto"));
var log21 = logger.child({ module: "billing.controller" });
(0, import_lemonsqueezy.lemonSqueezySetup)({
  apiKey: process.env.LEMON_SQUEEZY_API_KEY || "",
  onError: (error) => log21.error("Lemon Squeezy API Error", { error })
});
var STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID || "";
var PRO_VARIANT_ID = process.env.LEMON_SQUEEZY_PRO_VARIANT_ID || "";
var WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || "";
var getCheckoutUrl = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.subscriptionTier === "PRO" && user.subscriptionStatus === "active") {
      res.status(400).json({ error: "User is already on the PRO plan" });
      return;
    }
    const newCheckout = {
      checkoutOptions: {
        embed: false,
        media: false,
        logo: true
      },
      checkoutData: {
        email: user.email,
        name: user.name || "",
        custom: {
          user_id: userId
        }
      },
      productOptions: {
        redirectUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/dashboard?upgraded=true`,
        receiptButtonText: "Go to Dashboard",
        receiptThankYouNote: "Thank you for upgrading to PRO!"
      }
    };
    const { data, error } = await (0, import_lemonsqueezy.createCheckout)(STORE_ID, PRO_VARIANT_ID, newCheckout);
    if (error || !data) {
      log21.error("Failed to create checkout", { error });
      res.status(500).json({ error: "Failed to create checkout session" });
      return;
    }
    res.json({ checkoutUrl: data.data.attributes.url });
  } catch (error) {
    log21.error("Checkout creation error", { error });
    res.status(500).json({ error: "Internal server error" });
  }
};
var getCustomerPortalUrl = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.lemonSqueezyCustomerId) {
      res.status(404).json({ error: "No active subscription found" });
      return;
    }
    const { data, error } = await (0, import_lemonsqueezy.getCustomer)(user.lemonSqueezyCustomerId);
    if (error || !data) {
      log21.error("Failed to get customer portal", { error });
      res.status(500).json({ error: "Failed to retrieve customer portal" });
      return;
    }
    res.json({ portalUrl: data.data.attributes.urls.customer_portal });
  } catch (error) {
    log21.error("Customer portal error", { error });
    res.status(500).json({ error: "Internal server error" });
  }
};
var getSubscription = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    res.json({
      tier: user?.subscriptionTier || "FREE",
      status: user?.subscriptionStatus || null,
      periodEnd: user?.subscriptionPeriodEnd || null
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};
var handleWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing signature" });
      return;
    }
    const hmac = import_crypto2.default.createHmac("sha256", WEBHOOK_SECRET);
    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).json({ error: "Missing raw body" });
      return;
    }
    const digest = Buffer.from(hmac.update(rawBody).digest("hex"), "utf8");
    const signatureBuffer = Buffer.from(signature, "utf8");
    if (digest.length !== signatureBuffer.length || !import_crypto2.default.timingSafeEqual(digest, signatureBuffer)) {
      log21.warn("Invalid webhook signature");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
    const body = req.body;
    const eventName = body.meta.event_name;
    const obj = body.data.attributes;
    const customData = body.meta.custom_data;
    log21.info("Received Lemon Squeezy Webhook", { eventName });
    if (eventName === "subscription_created" || eventName === "subscription_updated") {
      const userId = customData?.user_id;
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionTier: "PRO",
            lemonSqueezyCustomerId: String(obj.customer_id),
            lemonSqueezySubscriptionId: String(body.data.id),
            subscriptionStatus: obj.status,
            subscriptionPeriodEnd: new Date(obj.renews_at)
          }
        });
      }
    } else if (eventName === "subscription_cancelled" || eventName === "subscription_expired") {
      const userId = customData?.user_id;
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionTier: "FREE",
            subscriptionStatus: obj.status
          }
        });
      }
    }
    res.status(200).send("OK");
  } catch (error) {
    log21.error("Webhook error", { error });
    res.status(500).json({ error: "Internal server error" });
  }
};

// src/server/routes/billing.routes.ts
var router10 = (0, import_express10.Router)();
router10.get("/checkout", authMiddleware, getCheckoutUrl);
router10.get("/portal", authMiddleware, getCustomerPortalUrl);
router10.get("/subscription", authMiddleware, getSubscription);
router10.post("/webhook", handleWebhook);
var billing_routes_default = router10;

// src/server/routes/index.ts
var apiRouter = (0, import_express11.Router)();
apiRouter.use("/clients", client_routes_default);
apiRouter.use("/invoices", invoice_routes_default);
apiRouter.use("/dashboard", dashboard_routes_default);
apiRouter.use("/settings", settings_routes_default);
apiRouter.use("/admin", admin_routes_default);
apiRouter.use("/pay", payment_routes_default);
apiRouter.use("/track", tracking_routes_default);
apiRouter.use("/upload", upload_routes_default);
apiRouter.use("/health", health_routes_default);
apiRouter.use("/billing", billing_routes_default);
var routes_default = apiRouter;

// src/server/middleware/error-handler.ts
init_logger();
var log22 = logger.child({ module: "error-handler" });
function errorHandler(err, req, res, _next) {
  log22.error("Unhandled error", {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack
  });
  const statusCode = err.statusCode || 500;
  if (process.env.NODE_ENV === "production") {
    res.status(statusCode).json({ error: "Internal server error" });
  } else {
    res.status(statusCode).json({
      error: err.message,
      stack: err.stack
    });
  }
}

// src/lib/rate-limit.ts
init_redis();
init_logger();
var log23 = logger.child({ module: "rate-limiter" });
async function checkRateLimit(key, limit, windowSeconds) {
  try {
    const redis = getRedisConnection();
    const now = Date.now();
    const windowStart = now - windowSeconds * 1e3;
    const fullKey = `ratelimit:${key}`;
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(fullKey, 0, windowStart);
    pipeline.zadd(fullKey, now, `${now}:${Math.random()}`);
    pipeline.zcard(fullKey);
    pipeline.expire(fullKey, windowSeconds);
    const results = await pipeline.exec();
    const count = results?.[2]?.[1] || 0;
    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    if (!allowed) {
      log23.warn("Rate limit exceeded", { key, count, limit, windowSeconds });
    }
    return {
      allowed,
      remaining,
      resetInSeconds: windowSeconds
    };
  } catch (err) {
    log23.error("Rate limit check failed, allowing request", {
      key,
      error: err instanceof Error ? err.message : String(err)
    });
    return { allowed: true, remaining: limit, resetInSeconds: windowSeconds };
  }
}
function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (forwarded) {
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return value.split(",")[0].trim();
  }
  const realIp = request.headers["x-real-ip"];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  return request.ip || "127.0.0.1";
}

// src/server/middleware/rate-limiter.ts
async function globalRateLimiter(req, res, next) {
  const ip = getClientIp(req);
  const limit = 100;
  const windowSeconds = 60;
  const { allowed, remaining, resetInSeconds } = await checkRateLimit(`global:${ip}`, limit, windowSeconds);
  res.setHeader("X-RateLimit-Limit", limit);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", Math.ceil(Date.now() / 1e3) + resetInSeconds);
  if (!allowed) {
    res.status(429).json({ error: "Too many requests, please try again later." });
    return;
  }
  next();
}

// src/modules/events/event-bus.ts
var import_events = require("events");
init_logger();
var log24 = logger.child({ module: "event-bus" });
var TypedEventBus = class {
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
    log24.info("Event emitted", {
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
        log24.error("Event handler error", {
          event,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : void 0
        });
      }
    });
    log24.info("Event handler registered", { event });
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
var eventBus = new TypedEventBus();

// src/modules/notification/notification.subscriber.ts
init_email_queue();

// src/modules/queues/overdue-check-queue.ts
init_queue();
init_queue_names();
init_logger();
var log27 = logger.child({ module: "overdue-check-queue" });
function getOverdueCheckQueue() {
  return createQueue(QUEUE_NAMES.OVERDUE_CHECK);
}
function calculateOptimalDeliveryTime(targetDate) {
  const date = new Date(targetDate);
  const day = date.getUTCDay();
  const hours = date.getUTCHours();
  let shiftDays = 0;
  if (day === 5 && hours >= 17) {
    shiftDays = 4;
  } else if (day === 6) {
    shiftDays = 3;
  } else if (day === 0) {
    shiftDays = 2;
  }
  if (shiftDays > 0) {
    date.setUTCDate(date.getUTCDate() + shiftDays);
    date.setUTCHours(10, 0, 0, 0);
  }
  return date;
}
async function scheduleOverdueChecks(data) {
  const queue = getOverdueCheckQueue();
  let checkpoints = [];
  if (data.customIntervals && typeof data.customIntervals === "object") {
    const { stage2Days, stage3Days, stage4Days } = data.customIntervals;
    checkpoints = [
      { daysOverdue: Number(stage2Days) || 3, stage: 2 },
      { daysOverdue: Number(stage3Days) || 7, stage: 3 },
      { daysOverdue: Number(stage4Days) || 14, stage: 4 }
    ];
  } else {
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
  }
  for (const checkpoint of checkpoints) {
    const jobId = `overdue:${data.invoiceId}:day:${checkpoint.daysOverdue}`;
    let targetTime = new Date(data.dueDate.getTime() + checkpoint.daysOverdue * 24 * 60 * 60 * 1e3);
    targetTime = calculateOptimalDeliveryTime(targetTime);
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
      log27.info("Overdue check scheduled", {
        jobId,
        invoiceId: data.invoiceId,
        daysOverdue: checkpoint.daysOverdue,
        stage: checkpoint.stage,
        scheduledFor: targetTime.toISOString()
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("Job already exists")) {
        log27.info("Overdue check already scheduled (idempotent skip)", {
          jobId,
          invoiceId: data.invoiceId
        });
        continue;
      }
      throw err;
    }
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
          log27.info("Cancelled pending overdue check", { jobId, invoiceId, day, state });
        }
      }
    } catch (err) {
      log27.warn("Failed to cancel overdue check", {
        jobId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return cancelled;
}

// src/modules/notification/notification.subscriber.ts
init_logger();
var log30 = logger.child({ module: "notification-subscriber" });
async function onInvoiceCreated(event) {
  log30.info("Handling invoice.created", { invoiceId: event.invoiceId });
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
    chaseIntervalDays: event.chaseIntervalDays,
    customIntervals: event.customIntervals
  });
  log30.info("All jobs scheduled for new invoice", {
    invoiceId: event.invoiceId,
    paymentDueIn: `${Math.round(delayMs / (1e3 * 60 * 60))}h`
  });
}
async function onInvoicePaymentDue(event) {
  log30.info("Invoice payment due event received", {
    invoiceId: event.invoiceId,
    dueDate: event.dueDate.toISOString()
  });
}
async function onInvoiceOverdue(event) {
  log30.info("Invoice overdue event received", {
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
  log30.info("Invoice paid \u2014 cancelling all pending jobs", {
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
  log30.info("Pending jobs cancelled for paid invoice", {
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
  log30.info("Notification subscribers registered");
}

// src/modules/events/audit.subscriber.ts
init_logger();
var log31 = logger.child({ module: "audit-subscriber" });
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
  log31.info("Audit subscribers registered");
}

// src/modules/events/event-registry.ts
init_logger();
var log32 = logger.child({ module: "event-registry" });
var registered = false;
function registerAllEventHandlers() {
  if (registered) {
    log32.info("Event handlers already registered, skipping");
    return;
  }
  registerNotificationSubscribers();
  registerAuditSubscribers();
  registered = true;
  log32.info("All event handlers registered");
}

// src/server/index.ts
init_logger();
var log33 = logger.child({ module: "server" });
var app = (0, import_express12.default)();
var PORT = parseInt(process.env.API_PORT || "4000", 10);
app.use((0, import_helmet.default)({
  // Disable CSP for API-only server (Next.js handles frontend CSP)
  contentSecurityPolicy: false
}));
app.use((0, import_cors.default)({
  origin: process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  credentials: true
}));
app.use(import_express12.default.json({
  limit: "5mb",
  verify: (req, res, buf) => {
    ;
    req.rawBody = buf;
  }
}));
app.use(import_express12.default.urlencoded({ extended: true }));
app.use((0, import_cookie_parser.default)());
app.use(globalRateLimiter);
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path !== "/api/health") {
      log33.info(`${req.method} ${req.path}`, {
        status: res.statusCode,
        duration: `${duration}ms`
      });
    }
  });
  next();
});
app.use("/api", routes_default);
app.use(errorHandler);
registerAllEventHandlers();
var server = app.listen(PORT, () => {
  log33.info(`Express API server running on port ${PORT}`, {
    port: PORT,
    env: process.env.NODE_ENV || "development",
    pid: process.pid
  });
});
var isShuttingDown = false;
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log33.info(`Received ${signal}, shutting down gracefully...`);
  server.close(async (err) => {
    if (err) {
      log33.error("Error closing HTTP server", { error: err.message });
    } else {
      log33.info("HTTP server closed");
    }
    try {
      await prisma.$disconnect();
      log33.info("Database connections closed");
      process.exit(0);
    } catch (dbErr) {
      log33.error("Error disconnecting database", {
        error: dbErr instanceof Error ? dbErr.message : String(dbErr)
      });
      process.exit(1);
    }
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
var server_default = app;
