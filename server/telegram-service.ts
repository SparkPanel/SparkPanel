import https from "https";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: {
      id: number;
      type: string;
    };
    text: string;
  };
}

export class TelegramService {
  private apiBaseUrl = "https://api.telegram.org";
  private chatIdCache = new Map<string, { chatId: string; timestamp: number }>();
  private CACHE_TTL = 10 * 60 * 1000;
  private pendingCodes = new Map<string, { code: string; timestamp: number }>();
  private pendingChatIds = new Map<string, { chatId: string; timestamp: number }>();
  private CODE_EXPIRY = 5 * 60 * 1000;

  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(token, "getMe", {});
      return response.ok === true;
    } catch (error) {
      console.error("Token validation error:", error);
      return false;
    }
  }

  async getBotUsername(token: string): Promise<string> {
    try {
      const response = await this.makeRequest(token, "getMe", {});
      if (response.ok && response.result?.username) {
        return response.result.username;
      }
      throw new Error("Could not get bot username");
    } catch (error) {
      console.error("Get bot username error:", error);
      throw error;
    }
  }

  async getChatId(token: string): Promise<string | null> {
    
    const cached = this.chatIdCache.get(token);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.chatId;
    }

    try {
      const response = await this.makeRequest(token, "getUpdates", {
        limit: 1,
        allowed_updates: ["message"],
      });

      if (response.ok && response.result && response.result.length > 0) {
        const update = response.result[response.result.length - 1] as TelegramUpdate;
        if (update.message?.chat?.id) {
          const chatId = update.message.chat.id.toString();
          
          this.chatIdCache.set(token, {
            chatId,
            timestamp: Date.now(),
          });
          return chatId;
        }
      }

      return null;
    } catch (error) {
      console.error("Get chat ID error:", error);
      return null;
    }
  }

  async sendCode(
    token: string,
    chatId: string,
    code: string,
    username: string
  ): Promise<boolean> {
    try {
      const message = `🔐 Ваш код двухфакторной аутентификации:\n\n<code>${code}</code>\n\nКод действует 5 минут.\n\nПользователь: ${username}`;

      const response = await this.makeRequest(token, "sendMessage", {
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      });

      if (!response.ok) {
        console.error("Telegram sendMessage failed:", JSON.stringify(response));
        return false;
      }

      return true;
    } catch (error) {
      console.error("Send code error:", error);
      return false;
    }
  }

  async sendTestMessage(token: string, chatId: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(token, "sendMessage", {
        chat_id: chatId,
        text: "✅ Telegram бот успешно подключен к SparkPanel!",
      });

      return response.ok === true;
    } catch (error) {
      console.error("Send test message error:", error);
      return false;
    }
  }

  generateSetupCode(token: string): string {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.pendingCodes.set(token, {
      code,
      timestamp: Date.now(),
    });
    return code;
  }

  async getChatIdFromCode(token: string): Promise<string | null> {
    try {
      const response = await this.makeRequest(token, "getUpdates", {
        limit: 10,
        allowed_updates: ["message"],
      });

      if (!response.ok || !response.result || response.result.length === 0) {
        return null;
      }

      
      for (let i = response.result.length - 1; i >= 0; i--) {
        const update = response.result[i] as TelegramUpdate;
        if (update.message?.text) {
          const messageCode = update.message.text.trim();
          const pending = this.pendingCodes.get(token);
          
          if (pending && messageCode === pending.code) {
            
            if (update.message.chat?.id) {
              const chatId = update.message.chat.id.toString();
              
              this.chatIdCache.set(token, {
                chatId,
                timestamp: Date.now(),
              });
              
              this.pendingCodes.delete(token);
              return chatId;
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error("Get chat ID from code error:", error);
      return null;
    }
  }

  private makeRequest(
    token: string,
    method: string,
    params: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = `${this.apiBaseUrl}/bot${token}/${method}`;
      const postData = JSON.stringify(params);

      const options = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
        timeout: 10000,
      };

      const req = https.request(url, options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });

      req.write(postData);
      req.end();
    });
  }
}

export const telegramService = new TelegramService();
