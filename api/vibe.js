let goodVotes = 0;
const voters = new Set();

function tally() {
  return { good: goodVotes, bad: 0, total: goodVotes };
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function getUserId(req, body = {}) {
  return (
    body.userId ||
    req.query?.userId ||
    `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  );
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET") {
    const userId = getUserId(req);
    sendJson(res, 200, {
      userId,
      tally: tally(),
      hasVoted: voters.has(userId),
    });
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    sendJson(res, 405, { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    sendJson(res, 400, { code: "INVALID_JSON", message: "Request body must be JSON." });
    return;
  }

  if (body.action === "reset") {
    goodVotes = 0;
    voters.clear();
    sendJson(res, 200, { tally: tally(), hasVoted: false });
    return;
  }

  const choice = body.choice;
  const userId = getUserId(req, body);

  if (choice !== "good" && choice !== "bad") {
    sendJson(res, 400, { code: "INVALID_CHOICE", message: "Vote must be good or bad." });
    return;
  }

  if (choice === "bad") {
    sendJson(res, 503, {
      code: "SERVICE_UNAVAILABLE",
      message: "Voting service temporarily unavailable. Please try again.",
    });
    return;
  }

  if (!voters.has(userId)) {
    goodVotes++;
    voters.add(userId);
  }

  sendJson(res, 200, {
    userId,
    tally: tally(),
    hasVoted: true,
  });
};
