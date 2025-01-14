const express = require("express");
const Redis = require("ioredis");
const crypto = require("crypto");

const app = express();
const port = 3000;

// Create a new Redis client instance
const redis = new Redis({
  host: "localhost",
  port: 6379, // Default Redis port
});

// Countdown logic and code generation
const countdownTime = 60; // Countdown time in seconds

const startCountdownAndGenerateCode = () => {
  const generateAndStoreCode = () => {
    const generatedCode = crypto.randomBytes(6).toString("hex");

    // Store the generated code in Redis with an expiration time
    redis.setex(
      "generated_code",
      countdownTime,
      generatedCode,
      (err, reply) => {
        if (err) {
          console.error("Error setting code in Redis:", err);
        } else {
          console.log("Code stored in Redis:", generatedCode);
        }
      }
    );

    // Start the countdown
    let countdown = countdownTime;
    const intervalId = setInterval(() => {
      countdown--;
      console.log(`Time remaining: ${countdown}s`);

      if (countdown <= 0) {
        clearInterval(intervalId);
        console.log("Countdown finished");
        // Optionally, reset or clear the generated code after countdown
        redis.del("generated_code", (err, reply) => {
          if (err) console.error("Error deleting code:", err);
          else console.log("Code deleted from Redis");
        });
        // Restart the countdown and code generation
        generateAndStoreCode();
      }
    }, 1000);
  };

  // Initially start the countdown and code generation
  generateAndStoreCode();
};

// Endpoint to retrieve the generated code
app.get("/getCode", (req, res) => {
  redis.get("generated_code", (err, code) => {
    if (err) {
      res.status(500).send("Error retrieving code.");
    } else if (code) {
      res.json({ code: code });
    } else {
      res.status(404).send("No code available.");
    }
  });
});

// Start the countdown and code generation loop
startCountdownAndGenerateCode();

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
