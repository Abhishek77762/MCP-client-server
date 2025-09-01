import express from "express";
import mongoose from "mongoose";
import Chat from "../models/chat.js";
import UserChats from "../models/userChats.js";
import { authenticate } from "./authRoutes.js";

const router = express.Router();

// Create chat
router.post("/", authenticate, async (req, res) => {
  const { text, files } = req.body;
  const userId = req.user.id;

  try {
    const chatTitle =
      text?.trim()
        ? text.substring(0, 40)
        : files?.length
        ? `📎 ${files.length} file${files.length > 1 ? "s" : ""} uploaded`
        : "New Chat";

    const newChat = new Chat({
      userId,
      history: [{ role: "user", parts: [{ text: text || "" }], files }],
    });

    const savedChat = await newChat.save();

    const userChats = await UserChats.findOne({ userId });

    if (!userChats) {
      await new UserChats({
        userId,
        chats: [{ _id: savedChat._id, title: chatTitle, createdAt: new Date() }],
      }).save();
    } else {
      await UserChats.updateOne(
        { userId },
        {
          $push: {
            chats: { _id: savedChat._id, title: chatTitle, createdAt: new Date() },
          },
        }
      );
    }

    res.status(201).send({
      _id: savedChat._id,
      messageId: savedChat.history[0].messageId,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Error creating chat!");
  }
});

// Get all user chats
router.get("/userchats", authenticate, async (req, res) => {
  const userId = req.user.id;
  
    try {
      const userChats = await UserChats.findOne({ userId });
      if (userChats) {
        res.status(200).send(userChats.chats);
      } else {
        res.status(200).send([]);
      }
    } catch (err) {
      console.log(err);
      res.status(500).send("Error fetching user chats!");
    }
});

// Get single chat
router.get("/:id", authenticate, async (req, res) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId: req.user.id });
    if (!chat) return res.status(404).send("Chat not found or user mismatch!");
    res.status(200).send(chat);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching chat!");
  }
});

// Append user + AI message
router.put("/:id", authenticate, async (req, res) => {
  const { question, answer, files, messageId } = req.body;
  const userId = req.user.id;

  const newItems = [
    ...(question || files?.length
      ? [{ role: "user", parts: [{ text: question || "" }], ...(files && { files }) }]
      : []),
    { role: "model", parts: [{ text: answer }], messageId },
  ];

  try {
    const updatedChat = await Chat.updateOne(
      { _id: req.params.id, userId },
      { $push: { history: { $each: newItems } } }
    );

    await UserChats.updateOne(
      { userId, "chats._id": req.params.id },
      { $set: { "chats.$.createdAt": new Date() } }
    );

    res.status(200).send(updatedChat);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error adding conversation!");
  }
});

// Add only user message
router.put("/:id/user", authenticate, async (req, res) => {
  const { question, files } = req.body;
  const userId = req.user.id;

  if (!question && (!files || files.length === 0))
    return res.status(400).send("Question or files are required!");

  try {
    const messageId = new mongoose.Types.ObjectId();

    const userMessage = {
      messageId,
      role: "user",
      parts: [{ text: question || "" }],
      timestamp: new Date(),
      ...(files?.length && { files }),
    };

    await Chat.updateOne(
      { _id: req.params.id, userId },
      { $push: { history: userMessage } }
    );

    await UserChats.updateOne(
      { userId, "chats._id": req.params.id },
      { $set: { "chats.$.createdAt": new Date() } }
    );

    res.status(200).send(messageId);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error adding user message!");
  }
});

// Add only AI response
router.put("/:id/ai", authenticate, async (req, res) => {
  const { answer, messageId } = req.body;
  if (!answer) return res.status(400).send("Answer is required!");

  try {
    const aiMessage = {
      role: "model",
      parts: [{ text: answer }],
      timestamp: new Date(),
      messageId,
    };

    const updatedChat = await Chat.updateOne(
      { _id: req.params.id, userId: req.user.id },
      { $push: { history: aiMessage } }
    );

    res.status(200).send(updatedChat);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error adding AI response!");
  }
});

// Delete chat
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const deletedChat = await Chat.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!deletedChat)
      return res.status(404).send("Chat not found or user mismatch!");

    await UserChats.updateOne(
      { userId: req.user.id },
      { $pull: { chats: { _id: req.params.id } } }
    );

    res.status(200).send("Chat deleted successfully!");
  } catch (err) {
    console.log(err);
    res.status(500).send("Error deleting chat!");
  }
});

export default router;
