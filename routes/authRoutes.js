import express from "express";
import jwt from "jsonwebtoken";
import passport from "passport";
import User from "../models/user.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Auth middleware
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  if (!token) return res.status(401).send("Unauthorized");
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).send("Invalid token");
  }
}

// Register
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password)
      return res.status(400).send("Email and password required");

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).send("Email already registered");

    const user = new User({ email, password, name });
    await user.save();
    const token = jwt.sign(
      { id: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user: { id: user._id, email: user.email, name: user.name },
    });
  } catch (e) {
    console.error(e);
    res.status(500).send("Registration failed");
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).send("Email and password required");

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).send("Invalid credentials");

    if (user.provider && !user.password) {
      return res
        .status(400)
        .send(
          `This account is linked with ${user.provider}. Please sign in with ${user.provider}.`
        );
    }

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).send("Invalid credentials");

    const token = jwt.sign(
      { id: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      token,
      user: { id: user._id, email: user.email, name: user.name },
    });
  } catch (e) {
    console.error(e);
    res.status(500).send("Login failed");
  }
});

export { authenticate };
export default router;
