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


// import dotenv from "dotenv";
// dotenv.config();
// import express from "express";
// import cors from "cors";
// import path from "path";
// //import url, { fileURLToPath } from "url";
// import ImageKit from "imagekit";
// import mongoose from "mongoose";
// import Chat from "./models/chat.js";
// import UserChats from "./models/userChats.js";
// import { askModel, connectMCP } from "./newClient.js";
// import fs from "fs";
// import jwt from "jsonwebtoken";
// import User from "./models/user.js";
// import passport from "passport";
// import session from "express-session";
// import { configurePassport } from "./auth.js";

// const port = process.env.PORT || 3000;
// const app = express();
// const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/chatapp1";
// const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
// const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";


// // Increase payload limits for file uploads (base64 encoded files can be large)
// app.use(express.json({ limit: '50mb' }));
// app.use(express.urlencoded({ limit: '50mb', extended: true }));
// app.use(cors({
//   origin: FRONTEND_URL,  // allow Vite frontend
//   credentials: true                // if you're using cookies/auth
// }));
// app.use(session({ secret: JWT_SECRET, resave: false, saveUninitialized: false }));
// app.use(passport.initialize());
// app.use(passport.session());
// configurePassport();

// // Simple auth middleware (Bearer token)
// function authenticate(req, res, next) {
//   const authHeader = req.headers.authorization || "";
//   const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
//   if (!token) return res.status(401).send("Unauthorized");
//   try {
//     const decoded = jwt.verify(token, JWT_SECRET);
//     req.user = decoded; // { id, email }
//     next();
//   } catch {
//     return res.status(401).send("Invalid token");
//   }
// }

// // Auth routes
// app.post("/api/auth/register", async (req, res) => {
//   try {
//     const { email, password, name } = req.body || {};
//     if (!email || !password) return res.status(400).send("Email and password required");
//     const existing = await User.findOne({ email: email.toLowerCase() });
//     if (existing) return res.status(409).send("Email already registered");
//     const user = new User({ email, password, name });
//     await user.save();
//     const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
//     res.status(201).json({ token, user: { id: user._id, email: user.email, name: user.name } });
//   } catch (e) {
//     console.error(e);
//     res.status(500).send("Registration failed");
//   }
// });

// app.post("/api/auth/login", async (req, res) => {
//   try {
//     const { email, password } = req.body || {};
//     if (!email || !password) return res.status(400).send("Email and password required");
//     const user = await User.findOne({ email: email.toLowerCase() });
//     if (!user) return res.status(401).send("Invalid credentials");
//     // Prevent local password login for OAuth-only accounts
//     if (user.provider && !user.password) {
//       return res.status(400).send(`This account is linked with ${user.provider}. Please sign in with ${user.provider}.`);
//     }
//     const valid = await user.comparePassword(password);
//     if (!valid) return res.status(401).send("Invalid credentials");
//     const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
//     res.status(200).json({ token, user: { id: user._id, email: user.email, name: user.name } });
//   } catch (e) {
//     console.error(e);
//     res.status(500).send("Login failed");
//   }
// });

// app.get("/api/auth/me", authenticate, async (req, res) => {
//   const user = await User.findById(req.user.id).select("_id email name avatar");
//   if (!user) return res.status(404).send("User not found");
//   res.json({ user: { id: user._id, email: user.email, name: user.name, avatar:user.avatar } });
// });

// // OAuth routes (registered only if env vars for strategy are present)
// if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
//   app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
//   app.get('/api/auth/google/callback', passport.authenticate('google', { failureRedirect: FRONTEND_URL + '/login' }), async (req, res) => {
//     const token = jwt.sign({ id: req.user.id, email: req.user.email }, JWT_SECRET, { expiresIn: '7d' });
//     res.redirect(`${FRONTEND_URL}/oauth/callback?token=${token}`);
//   });
// }

// if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
//   app.get('/api/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
//   app.get('/api/auth/github/callback', passport.authenticate('github', { failureRedirect: FRONTEND_URL + '/login' }), async (req, res) => {
//     const token = jwt.sign({ id: req.user.id, email: req.user.email }, JWT_SECRET, { expiresIn: '7d' });
//     res.redirect(`${FRONTEND_URL}/oauth/callback?token=${token}`);
//   });
// }

// if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
//   app.get('/api/auth/discord', passport.authenticate('discord'));
//   app.get('/api/auth/discord/callback', passport.authenticate('discord', { failureRedirect: FRONTEND_URL + '/login' }), async (req, res) => {
//     const token = jwt.sign({ id: req.user.id, email: req.user.email }, JWT_SECRET, { expiresIn: '7d' });
//     res.redirect(`${FRONTEND_URL}/oauth/callback?token=${token}`);
//   });
// }

// if (process.env.HF_CLIENT_ID && process.env.HF_CLIENT_SECRET) {
//   app.get('/api/auth/hf', passport.authenticate('huggingface'));
//   app.get('/api/auth/hf/callback', passport.authenticate('huggingface', { failureRedirect: FRONTEND_URL + '/login' }), async (req, res) => {
//     const token = jwt.sign({ id: req.user.id, email: req.user.email }, JWT_SECRET, { expiresIn: '7d' });
//     res.redirect(`${FRONTEND_URL}/oauth/callback?token=${token}`);
//   });
// }

// app.post("/api/chats", authenticate, async (req, res) => {
//   const { text, files } = req.body;
//   const userId = req.user.id;

//   try {
//     // Generate appropriate title
//     const chatTitle = text && text.trim()
//       ? text.substring(0, 40)
//       : files && files.length > 0
//         ? `📎 ${files.length} file${files.length > 1 ? 's' : ''} uploaded`
//         : "New Chat";

//     const newChat = new Chat({
//       userId: userId,
//       history: [{ role: "user", parts: [{ text: text || "" }], files }],
//     });

//     const savedChat = await newChat.save();


//     const userChats = await UserChats.findOne({ userId: userId });


//     if (!userChats) {
//       const newUserChats = new UserChats({
//         userId: userId,
//         chats: [
//           {
//             _id: savedChat._id,
//             title: chatTitle,
//             createdAt: new Date(), // Explicitly set current timestamp
//           },
//         ],
//       });
//       await newUserChats.save();
//     } else {

//       await UserChats.updateOne(
//         { userId: userId },
//         {
//           $push: {
//             chats: {
//               _id: savedChat._id,
//               title: chatTitle,
//               createdAt: new Date(),
//             },
//           },
//         }
//       );
//     }
//     res.status(201).send({
//       _id: savedChat._id,
//       messageId: savedChat.history[0].messageId
//     });
//     // res.status(201).send(savedChat._id);
//   } catch (err) {
//     console.log(err);
//     res.status(500).send("Error creating chat!");
//   }
// });


// app.get("/api/userchats", authenticate, async (req, res) => {
//   const userId = req.user.id;

//   try {
//     const userChats = await UserChats.findOne({ userId });
//     if (userChats) {
//       res.status(200).send(userChats.chats);
//     } else {
//       res.status(200).send([]);
//     }
//   } catch (err) {
//     console.log(err);
//     res.status(500).send("Error fetching user chats!");
//   }
// });


// app.get("/api/chats/:id", authenticate, async (req, res) => {
//   const userId = req.user.id;

//   try {
//     const chat = await Chat.findOne({ _id: req.params.id, userId });
//     if (!chat) {
//       return res.status(404).send("Chat not found or user mismatch!");
//     }
//     res.status(200).send(chat);
//   } catch (err) {
//     console.log(err);
//     res.status(500).send("Error fetching chat!");
//   }
// });


// app.put("/api/chats/:id", authenticate, async (req, res) => {
//   const { question, answer, files, messageId } = req.body;
//   const userId = req.user.id;

//   const newItems = [
//     ...(question || (files && files.length > 0)
//       ? [{ role: "user", parts: [{ text: question || "" }], ...(files && { files }) }]
//       : []),
//     { role: "model", parts: [{ text: answer }], messageId },
//   ];

//   try {
//     const updatedChat = await Chat.updateOne(
//       { _id: req.params.id, userId },
//       {
//         $push: {
//           history: {
//             $each: newItems,
//           },
//         },
//       }
//     );

//     // Update timestamp in UserChats for chat ordering
//     await UserChats.updateOne(
//       { userId: userId, "chats._id": req.params.id },
//       {
//         $set: {
//           "chats.$.createdAt": new Date()
//         }
//       }
//     );

//     res.status(200).send(updatedChat);
//   } catch (err) {
//     console.log(err);
//     res.status(500).send("Error adding conversation!");
//   }
// });

// // NEW: Save user message only
// app.put("/api/chats/:id/user", authenticate, async (req, res) => {
//   const { question, files } = req.body;
//   const userId = req.user.id;

//   if (!question && (!files || files.length === 0)) {
//     return res.status(400).send("Question or files are required!");
//   }

//   try {
//     const messageId = new mongoose.Types.ObjectId();

//     const userMessage = {
//       messageId: messageId,
//       role: "user",
//       parts: [{ text: question || "" }],
//       timestamp: new Date(),
//       ...(files && files.length > 0 && { files })
//     };

//     const updatedChat = await Chat.updateOne(
//       { _id: req.params.id, userId },
//       {
//         $push: {
//           history: userMessage
//         },
//       }
//     );

//     // Update timestamp in UserChats for chat ordering
//     await UserChats.updateOne(
//       { userId: userId, "chats._id": req.params.id },
//       {
//         $set: {
//           "chats.$.createdAt": new Date()
//         }
//       }
//     );

//     res.status(200).send(messageId);
//   } catch (err) {
//     console.log(err);
//     res.status(500).send("Error adding user message!");
//   }
// });

// // NEW: Save AI response only
// app.put("/api/chats/:id/ai", authenticate, async (req, res) => {
//   const { answer, messageId } = req.body;
//   const userId = req.user.id;

//   if (!answer) {
//     return res.status(400).send("Answer is required!");
//   }

//   try {
//     const aiMessage = {
//       role: "model",
//       parts: [{ text: answer }],
//       timestamp: new Date(),
//       messageId
//     };

//     const updatedChat = await Chat.updateOne(
//       { _id: req.params.id, userId },
//       {
//         $push: {
//           history: aiMessage
//         },
//       }
//     );

//     res.status(200).send(updatedChat);
//   } catch (err) {
//     console.log(err);
//     res.status(500).send("Error adding AI response!");
//   }
// });

// app.delete("/api/chats/:id", authenticate, async (req, res) => {
//   const userId = req.user.id;

//   try {
//     // Delete from Chat collection
//     const deletedChat = await Chat.findOneAndDelete({ _id: req.params.id, userId });


//     if (!deletedChat) {
//       return res.status(404).send("Chat not found or user mismatch!");
//     }
//     // Remove from UserChats collection
//     await UserChats.updateOne(
//       { userId: userId },
//       {
//         $pull: {
//           chats: { _id: req.params.id }
//         }
//       }
//     );


//     res.status(200).send("Chat deleted successfully!");
//   } catch (err) {
//     console.log(err);
//     res.status(500).send("Error deleting chat!");
//   }
// });


// app.post("/api/mcp/connect", async (req, res) => {
//   const { url } = req.body;
//   try {
//     const connection = await connectMCP(url);
//     if (connection.success) {
//       res.status(200).send({ success: true });
//     }
//     else {
//       res.status(400).send({ success: false, error: connection.error });
//     }
//   } catch (error) {
//     console.log(error);
//     res.status(500).send({ success: false, error: error.message || error });
//   }
// })

// app.post("/api/mcp/askModel", async (req, res) => {
//   const { prompt, model, apiKey, history, files } = req.body;

//   try {
//     // console.log("Received files in request:", files);
//     const result = await askModel(prompt, files, model, apiKey, history);
//     res.status(200).send(result);
//   } catch (error) {
//     console.log(error);
//     res.status(500).send({ success: false, error: error.message || error });
//   }
 
// });

// app.get('/api/mcp/servers', async (req, res) => {
//   const servers = JSON.parse(fs.readFileSync("mcp.config.json", "utf-8")).servers;
//   res.json(servers);
// });

// mongoose.connect(MONGO_URI)
//   .then(() => {
//     console.log('MongoDB connected successfully to local database');
//     app.listen(port, () => console.log(`Server running on port ${port}`));
//   })
//   .catch((err) => console.error('MongoDB connection error:', err));