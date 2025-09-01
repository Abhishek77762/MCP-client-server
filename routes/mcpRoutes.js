import express from "express";
import fs from "fs";
import { askModel, connectMCP } from "../newClient.js";

const router = express.Router();

router.post("/connect", async (req, res) => {
  const { url } = req.body;
  let connection = null;
  try {
    connection = await connectMCP(url);
    if (connection.success) {
      res.status(200).send({ success: true });
    } else {
      res.status(400).send({ success: false, error: connection.error });
    }
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, error: error.message || error });
  } finally{
    await connection.client?.close();
  }
});

router.post("/askModel", async (req, res) => {
  const { prompt, model, apiKey, history, files, url } = req.body;
  try {
    const result = await askModel(prompt, files, model, apiKey, history, url);
    res.status(200).send(result);
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, error: error.message || error });
  }
});

router.get("/servers", async (req, res) => {
  const servers = JSON.parse(fs.readFileSync("mcp.config.json", "utf-8")).servers;
  res.json(servers);
});

export default router;
