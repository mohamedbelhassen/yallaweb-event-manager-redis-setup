const express = require("express");
const Redis = require("ioredis");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
const port = 3001;

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
const redis = new Redis({
  host: "localhost",
  port: 6379,
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
app.post("/startSession", (req, res) => {
  try {
    const { duration = 60 } = req.body;
    const sessionId = uuidv4();
    let code = generateCode();

    logger.info(
      `Creating new session: ${sessionId} with duration: ${duration}s`
    );

    const sessionInterval = setInterval(async () => {
      code = generateCode();
      await redis.set(`session:${sessionId}`, code);
      logger.info(`New code generated for session ${sessionId}: ${code}`);
    }, duration * 1000);

    activeSessions.set(sessionId, {
      interval: sessionInterval,
      startTime: Date.now(),
      duration: duration,
    });

    res.json({
      sessionId,
      code,
      duration,
    });

    logger.success(
      `Session started: ${sessionId}, Initial Code: ${code}, Duration: ${duration}s`
    );
  } catch (error) {
    logger.error(`Error creating session: ${error.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get current code for a session
app.get("/getCode", async (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId) {
    logger.warn("Get code attempt without sessionId");
    return res.status(400).json({ error: "Session ID required" });
  }

  try {
    logger.info(`Retrieving code for session: ${sessionId}`);
    const code = await redis.get(`session:${sessionId}`);

    if (!code) {
      logger.warn(`Code not found for session: ${sessionId}`);
      return res
        .status(404)
        .json({ error: "Code not found or session expired" });
    }

    logger.success(`Code retrieved for session: ${sessionId}`);
    res.json({ code });
  } catch (error) {
    logger.error(`Error retrieving code: ${error.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Stop a session
app.post("/stopSession", (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    logger.warn("Stop session attempt without sessionId");
    return res.status(400).json({ error: "Session ID required" });
  }

  if (activeSessions.has(sessionId)) {
    clearInterval(activeSessions.get(sessionId).interval);
    activeSessions.delete(sessionId);
    redis.del(`session:${sessionId}`);
    logger.success(`Session stopped: ${sessionId}`);
    res.json({ message: "Session stopped successfully" });
  } else {
    logger.warn(`Attempt to stop non-existent session: ${sessionId}`);
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
    clearInterval(session.interval);
    redis.del(`session:${sessionId}`);
  });
  redis.disconnect();
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.warn("Received SIGINT. Performing graceful shutdown...");
  activeSessions.forEach((session, sessionId) => {
    clearInterval(session.interval);
    redis.del(`session:${sessionId}`);
  });
  redis.disconnect();
  process.exit(0);
});
