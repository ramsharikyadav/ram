import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { createServer } from "http";
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({ level: "silent" });

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const PORT = 3000;

  app.use(express.json());

  // WhatsApp Web Logic
  let sock: any = null;
  let qrCode: string | null = null;
  let connectionStatus: "connecting" | "open" | "close" | "qr" = "close";

  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  async function connectToWhatsApp() {
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
    });

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        qrCode = await QRCode.toDataURL(qr);
        connectionStatus = "qr";
        io.emit("whatsapp:qr", qrCode);
      }

      if (connection === "close") {
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
        connectionStatus = "close";
        qrCode = null;
        io.emit("whatsapp:status", "close");
        if (shouldReconnect) {
          connectToWhatsApp();
        }
      } else if (connection === "open") {
        connectionStatus = "open";
        qrCode = null;
        io.emit("whatsapp:status", "open");
      }
    });

    sock.ev.on("creds.update", saveCreds);
  }

  // Initial connection attempt
  connectToWhatsApp();

  io.on("connection", (socket) => {
    if (qrCode) socket.emit("whatsapp:qr", qrCode);
    socket.emit("whatsapp:status", connectionStatus);
    
    socket.on("whatsapp:reconnect", () => {
      if (connectionStatus !== "open") {
        connectToWhatsApp();
      }
    });

    socket.on("whatsapp:logout", async () => {
      if (sock) {
        await sock.logout();
        // Clear auth folder
        if (fs.existsSync("auth_info_baileys")) {
          fs.rmSync("auth_info_baileys", { recursive: true, force: true });
        }
        connectToWhatsApp();
      }
    });
  });

  // API Route for sending WhatsApp messages via Business API (Legacy)
  app.post("/api/whatsapp/send", async (req, res) => {
    const { to, message, imageUrl } = req.body;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      return res.status(400).json({ 
        error: "WhatsApp Business API credentials not configured." 
      });
    }

    try {
      let body;
      if (imageUrl) {
        body = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to,
          type: "image",
          image: { link: imageUrl, caption: message }
        };
      } else {
        body = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to,
          type: "text",
          text: { body: message }
        };
      }

      const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Failed to send message");
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API Route for sending via Synced WhatsApp Web
  app.post("/api/whatsapp/web/send", async (req, res) => {
    const { to, message, imageUrl } = req.body;

    if (connectionStatus !== "open" || !sock) {
      return res.status(400).json({ error: "WhatsApp Web is not synced. Please scan the QR code first." });
    }

    try {
      const jid = `${to}@s.whatsapp.net`;
      
      if (imageUrl) {
        // Baileys can take a URL or Buffer
        await sock.sendMessage(jid, { 
          image: { url: imageUrl }, 
          caption: message 
        });
      } else {
        await sock.sendMessage(jid, { text: message });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("WhatsApp Web Send Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
