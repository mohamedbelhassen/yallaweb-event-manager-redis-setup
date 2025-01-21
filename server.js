const express = require("express");
const Redis = require("ioredis");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
// const port = 3001;
const port = process.env.PORT || 3001;

// Add timestamp to logs
function getTimestamp() {
  return new Date().toISOString();
}

// Colored console logs
const logger = {
  info: (message) =>
    console.log(`\x1b[36m[${getTimestamp()}] INFO: ${message}\x1b[0m`),
  success: (message) =>
    console.log(`\x1b[32m[${getTimestamp()}] SUCCESS: ${message}\x1b[0m`),
  error: (message) =>
    console.log(`\x1b[31m[${getTimestamp()}] ERROR: ${message}\x1b[0m`),
  warn: (message) =>
    console.log(`\x1b[33m[${getTimestamp()}] WARNING: ${message}\x1b[0m`),
};

// Redis client setup
// const redis = new Redis({
  // host: "localhost",
  // port: 6379,
// });

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
});



redis.on("connect", () => {
  logger.success("Redis connected successfully");
});

redis.on("error", (err) => {
  logger.error(`Redis connection error: ${err}`);
});

// Middleware
app.use(cors());
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Generate a random 6-digit code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Store active sessions
const activeSessions = new Map();

// Start a new session
app.post("/events/:eventId/startSession", async (req, res) => {
  const { eventId } = req.params;
  try {
    const sessionId = uuidv4();
    let code = generateCode();

    logger.info(`Creating new session for event ${eventId}: ${sessionId}`);

    activeSessions.set(sessionId, {
      eventId,
      startTime: Date.now(),
    });

    // Set the new code without expiration
    await redis.set(`event:${eventId}:session:${sessionId}`, code);

    res.json({
      sessionId,
      code,
    });

    logger.success(
      `Session started for event ${eventId}: ${sessionId}, Initial Code: ${code}`
    );
  } catch (error) {
    logger.error(
      `Error creating session for event ${eventId}: ${error.message}`
    );
    res.status(500).json({ error: "Internal server error" });
  }
});

// Generate new code for a session
app.post(
  "/events/:eventId/sessions/:sessionId/generateCode",
  async (req, res) => {
    const { eventId, sessionId } = req.params;

    if (!activeSessions.has(sessionId)) {
      logger.warn(
        `Attempt to generate code for non-existent session: ${sessionId}`
      );
      return res.status(404).json({ error: "Session not found" });
    }

    try {
      // Delete the old code immediately
      await redis.del(`event:${eventId}:session:${sessionId}`);

      const newCode = generateCode();

      // Set the new code without expiration
      await redis.set(`event:${eventId}:session:${sessionId}`, newCode);

      logger.success(
        `New code generated for event ${eventId}, session ${sessionId}: ${newCode}`
      );
      res.json({ code: newCode });
    } catch (error) {
      logger.error(
        `Error generating new code for event ${eventId}, session ${sessionId}: ${error.message}`
      );
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get current code for a session
app.get("/events/:eventId/sessions/:sessionId/code", async (req, res) => {
  const { eventId, sessionId } = req.params;

  try {
    logger.info(`Retrieving code for event ${eventId}, session: ${sessionId}`);
    const code = await redis.get(`event:${eventId}:session:${sessionId}`);

    if (!code) {
      logger.warn(`Code not found for event ${eventId}, session: ${sessionId}`);
      return res
        .status(404)
        .json({ error: "Code not found or session expired" });
    }

    logger.success(
      `Code retrieved for event ${eventId}, session: ${sessionId}`
    );
    res.json({ code });
  } catch (error) {
    logger.error(
      `Error retrieving code for event ${eventId}, session ${sessionId}: ${error.message}`
    );
    res.status(500).json({ error: "Internal server error" });
  }
});

// Stop a session
app.post("/events/:eventId/sessions/:sessionId/stop", (req, res) => {
  const { eventId, sessionId } = req.params;

  if (activeSessions.has(sessionId)) {
    activeSessions.delete(sessionId);
    redis.del(`event:${eventId}:session:${sessionId}`);
    logger.success(`Session stopped for event ${eventId}: ${sessionId}`);
    res.json({ message: "Session stopped successfully" });
  } else {
    logger.warn(
      `Attempt to stop non-existent session for event ${eventId}: ${sessionId}`
    );
    res.status(404).json({ error: "Session not found" });
  }
});

// Track active sessions count
setInterval(async () => {
  logger.info(`Active sessions: ${activeSessions.size}`);
}, 30000); // Log every 30 seconds

app.listen(port, () => {
  logger.success(`Server running on port ${port}`);
  logger.info("=================================");
  logger.info("🚀 Redis Counter Server Started");
  logger.info("=================================");
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  logger.warn("Received SIGTERM. Performing graceful shutdown...");
  activeSessions.forEach((session, sessionId) => {
    redis.del(`event:${session.eventId}:session:${sessionId}`);
  });
  redis.disconnect();
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.warn("Received SIGINT. Performing graceful shutdown...");
  activeSessions.forEach((session, sessionId) => {
    redis.del(`event:${session.eventId}:session:${sessionId}`);
  });
  redis.disconnect();
  process.exit(0);
});
