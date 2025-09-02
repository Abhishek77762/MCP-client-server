import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { openAIModels, geminiModels, claudeModels, grokModels } from "./Models.js";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGroq } from "@langchain/groq";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod";
import { tool, DynamicStructuredTool } from "@langchain/core/tools";
import { attachmentsToContent } from "./services.js";
// import { attachmentsToContent } from "../services.js"; // keep your existing file extraction


// let mcpClient = null;
// let chatModel = null;
// let currentMCPUrl = null; // track manually

async function connectMCP(url) {
  let mcpClient = null;
  try {
    console.log("Connecting to MCP at:", url);
    const transport = new StreamableHTTPClientTransport(new URL(url));

    mcpClient = new Client({ name: "MCP Client", version: "1.0.0" });
    await mcpClient.connect(transport);
    return { success: true, client: mcpClient };
  } catch (error) {
    console.error("Error connecting to MCP in connect mcp function");
    mcpClient = null;
    return { success: false, error: error.message || error };
  }
}

async function getTools(mcpClient) {
  if (!mcpClient) {
    throw new Error("MCP Client is not connected.");
  }
  const { tools: mcpTools } = await mcpClient.listTools();
  if (!mcpTools || mcpTools.length === 0) {
    console.warn("No tools found in MCP.");
    return [];
  }

  return mcpTools.map(
    (t) =>
      new DynamicStructuredTool({
        name: t.name,
        description: t.description || "",
        schema: z.object(
          Object.fromEntries(
            Object.entries(t.inputSchema?.properties || {}).map(([k, v]) => [
              k,
              z.string().describe(v.description || ""),
            ])
          )
        ),
        func: async (args) => {
          const result = await mcpClient.callTool({
            name: t.name,
            arguments: args,
          });
          return result?.content?.[0]?.text ?? JSON.stringify(result);
        },
      })
  );
}


async function summarizeHistory(messages, summarizerModel) {
  if (messages.length <= 10) return messages;

  const oldMessages = messages.slice(0, messages.length - 10);
  const recentMessages = messages.slice(-10);

  // Use a lightweight summarizer model (could even be same model)
  const summaryPrompt = `Summarize the following conversation briefly, preserving context for future turns:\n\n${oldMessages.map(m => m.text).join("\n")}`;

  const summaryResponse = await summarizerModel.invoke([new HumanMessage(summaryPrompt)]);

  return [
    new AIMessage({
      content: `Summary of earlier conversation: ${summaryResponse.content}`,
    }),
    ...recentMessages,
  ];
}


function getSystemPrompt(mcpClient) {
  if (mcpClient) {
    return `You are connected to MCP server.
This MCP provides domain-specific tools. Only use MCP-related responses when the user asks relevant to this server.
When the user asks questions related to the domain of the MCP server, use the available tools to provide accurate and relevant information.
DO NOT GET CONFUSED WITH PREVIOUS CONTEXT READ CONTEXT, IF IT IS NECCESARY TO CURRENT PROMPT THEN USE CONTEXT.
For other general questions, behave like a normal AI assistant.
if you are connected to mcp and then given mcp specific prompt or any prompt related to mcp then use mcp context but not a error one or where mcp is not connected again try with mcp if previous prompt was for mcp but mcp not connecetd it gives i don't know answer then dont read that context.
you have to call mcp tools if they are relevant to the prompt.
`;
  } else {
    return `You are NOT connected to any MCP server. Do not reference MCP tools answer generally like llm and say don't know and dont get confused with previous context.
Just behave like a normal AI assistant.
DO NOT GET CONFUSED WITH PREVIOUS CONTEXT READ CONTEXT IF IT IS NECCESARY TO CURRENT PROMPT THEN USE CONTEXT.
if you are given mcp specific prompt or any prompt related to mcp then do not use mcp context just reply like normal llm.
`;
  }
}



async function askModel(prompt, files, modelName, apiKey, history = [], url) {
  let mcpClient = null;
  try {
    const { success, client } = await connectMCP(url);
    if (success) {
      mcpClient = client;
    }
  } catch (error) {
    mcpClient = null;
    console.log("Error connecting to MCP from askmodel");
  }
  if (!mcpClient) {
    // throw new Error("MCP Client is not connected. Please connect first.");
    console.log("MCP Client is not connected. Please connect first.");
  }

  if (!apiKey || apiKey.trim() === "") {
    return {
      success: false,
      type: "error",
      content: `No API key provided for model: ${modelName}`,
      history: [],
    };
  }
  let chatModel = null;
  if (openAIModels.includes(modelName)) {
    chatModel = new ChatOpenAI({ model: modelName, openAIApiKey: apiKey });
  } else if (geminiModels.includes(modelName)) {
    chatModel = new ChatGoogleGenerativeAI({ model: modelName, apiKey });
  } else if (claudeModels.includes(modelName)) {
    chatModel = new ChatAnthropic({ model: modelName, apiKey });
  } else if (grokModels.includes(modelName)) {
    chatModel = new ChatGroq({ model: modelName, apiKey });
  } else {
    throw new Error(`Unsupported model: ${modelName}`);
  }
  let modelWithTools = chatModel;
  if (mcpClient) {
    const mcpTools = await getTools(mcpClient);

    modelWithTools =
      mcpTools.length > 0 ? chatModel.bindTools(mcpTools) : chatModel;

    console.log("Model with tools:", mcpTools.map((tool) => tool.name));
  }


  let messages = history.map((m) => {
    if (m.sender === "user") {
      return new HumanMessage(m.text);
    } else {
      return new AIMessage(m.text);
    }
  });

  messages = await summarizeHistory(messages, chatModel);

  const systemPrompt = getSystemPrompt(mcpClient);
  messages.unshift(new AIMessage({ content: systemPrompt }));

  const attachments = await attachmentsToContent(files);
  // messages.push(new HumanMessage(new HumanMessage({
  //   content: [
  //     { type: "text", text: prompt },
  //     ...attachments,
  //   ],
  // })));
  messages.push(new HumanMessage({
    content: [
      { type: "text", text:  prompt  },
      ...attachments,
    ],
  }));

  const MAX_TURNS = 5;
  for (let i = 0; i < MAX_TURNS; i++) {
    const response = await modelWithTools.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      return {
        success: true,
        type: "final",
        content: response.content, // final text for UI
        history: messages.map((m) => ({ role: m._getType(), content: m.content })),
      };
    }

    const toolMessages = [];
    for (const toolCall of response.tool_calls) {
      try {
        const toolResult = await mcpClient.callTool({
          name: toolCall.name,
          arguments: toolCall.args,
        });

        const toolOutput = toolResult?.content?.[0]?.text ?? JSON.stringify(toolResult);

        toolMessages.push(
          new ToolMessage({
            content: toolOutput,
            tool_call_id: toolCall.id,
          })
        );

        messages.push(
          new ToolMessage({
            content: toolOutput,
            tool_call_id: toolCall.id,
          })
        );
      } catch (e) {
        toolMessages.push(
          new ToolMessage({
            content: `Error: ${e instanceof Error ? e.message : String(e)}`,
            tool_call_id: toolCall.id,
          })
        );
      }
    }
  }

  return {
    success: false,
    type: "stopped",
    content: "Agent stopped after reaching max turns.",
    history: messages.map((m) => ({ role: m._getType(), content: m.content })),
  };
}

export { connectMCP, askModel };
