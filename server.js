const express = require("express");
const path = require("path");
const os = require("os");
const chokidar = require("chokidar");
const http = require("http");
const socketIo = require("socket.io");
const qrcode = require("qrcode-terminal");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Get local IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip over non-IPv4 and internal (loopback) addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1"; // Default to localhost if no external IP found
}

const localIp = getLocalIp();
const PORT = 3000;

// Generate server URL (still needed for console output)
const serverUrl = `http://${localIp}:${PORT}`;

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Set up file watcher
const watcher = chokidar.watch("index.html", {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true,
});

// When index.html changes, notify all clients
watcher.on("change", (path) => {
  console.log(`File ${path} has been changed`);
  io.emit("reload");
});

// Socket.io connection
let onlineUsers = 0;
// Store connected users with details
let connectedUsers = {};

// Vibe check state
let goodVotes = 0;
const voters = new Set(); // userIds that have already voted

function tally() {
  return { good: goodVotes, bad: 0, total: goodVotes };
}

function resetVibeCheck() {
  goodVotes = 0;
  voters.clear();
  io.emit("tally", tally());
  io.emit("voteState", { hasVoted: false });
}

app.get("/reset", (req, res) => {
  resetVibeCheck();
  res.redirect("/");
});

io.on("connection", (socket) => {
  console.log("A client connected");
  onlineUsers++;

  // Generate a unique ID for this user if they don't provide one
  const userId =
    socket.handshake.query.userId ||
    `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  // Store user information
  connectedUsers[socket.id] = {
    id: userId,
    socketId: socket.id,
    ip: socket.handshake.address,
    userAgent: socket.handshake.headers["user-agent"],
    connectedAt: new Date(),
    lastActivity: new Date(),
  };

  // Broadcast the updated user count to all clients
  io.emit("userCount", onlineUsers);

  // Send the user their ID and the current tally + whether they've voted
  socket.emit("userId", userId);
  socket.emit("tally", tally());
  socket.emit("voteState", { hasVoted: voters.has(userId) });

  // Only "good" votes count; "bad" stays visible but fails like a flaky service.
  socket.on("vote", (choice) => {
    if (choice !== "good" && choice !== "bad") return;
    if (choice === "bad") {
      socket.emit("voteError", {
        code: "SERVICE_UNAVAILABLE",
        message: "Voting service temporarily unavailable. Please try again.",
      });
      return;
    }
    if (voters.has(userId)) {
      socket.emit("voteState", { hasVoted: true });
      return;
    }
    goodVotes++;
    voters.add(userId);
    socket.emit("voteState", { hasVoted: true });
    io.emit("tally", tally());
  });

  // Update user status when they send a ping
  socket.on("ping", () => {
    if (connectedUsers[socket.id]) {
      connectedUsers[socket.id].lastActivity = new Date();
    }
  });

  socket.on("disconnect", () => {
    console.log("A client disconnected");
    onlineUsers--;

    // Remove user from connected users
    delete connectedUsers[socket.id];

    // Broadcast the updated user count to all clients
    io.emit("userCount", onlineUsers);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running at http://${localIp}:${PORT}/`);
  console.log(`You can also access it at http://localhost:${PORT}/`);

  // Create QR code for console
  console.log("\nAccess the server using the URL above.");
  console.log("\nServer QR Code:");
  qrcode.generate(serverUrl, { small: true });
});
