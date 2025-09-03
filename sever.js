import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import session from "express-session";
import passport from "passport";
import { configurePassport } from "./auth.js";
import { authenticate } from "./routes/authRoutes.js";
import jwt from "jsonwebtoken";

import User from "./models/user.js";
// Routers
import authRoutes from "./routes/authRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import mcpRoutes from "./routes/mcpRoutes.js";

const port = process.env.PORT ;
const app = express();

const MONGO_URI = process.env.MONGO_URI ;
const JWT_SECRET = process.env.JWT_SECRET ;
const FRONTEND_URL = process.env.FRONTEND_URL;

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(
  session({ secret: JWT_SECRET, resave: false, saveUninitialized: false,cookie:{sameSite:"none",secure:true} })
);
app.use(passport.initialize());
app.use(passport.session());
configurePassport();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/mcp", mcpRoutes);
app.get("/api/auth/me", authenticate, async (req, res) => {
  const user = await User.findById(req.user.id).select("_id email name avatar");
  if (!user) return res.status(404).send("User not found");
  res.json({ user: { id: user._id, email: user.email, name: user.name, avatar: user.avatar } });
});

// OAuth routes (registered only if env vars for strategy are present)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  app.get('/api/auth/google/callback', passport.authenticate('google', { failureRedirect: FRONTEND_URL + '/login' }), async (req, res) => {
    const token = jwt.sign({ id: req.user.id, email: req.user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.redirect(`${FRONTEND_URL}/oauth/callback?token=${token}`);
  });
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  app.get('/api/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
  app.get('/api/auth/github/callback', passport.authenticate('github', { failureRedirect: FRONTEND_URL + '/login' }), async (req, res) => {
    const token = jwt.sign({ id: req.user.id, email: req.user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.redirect(`${FRONTEND_URL}/oauth/callback?token=${token}`);
  });
}




// Mongo + Start
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("MongoDB connected successfully");
    app.listen(port, () =>
      console.log(`🚀 Server running on http://localhost:${port}`)
    );
  })
  .catch((err) => console.error("MongoDB connection error:", err));

