import mineflayer from "mineflayer";
import chalk from "chalk";
import { createServer } from "node:http";
import { SocksClient } from "socks";

const webPort = Number(process.env.PORT ?? 3001);

// Setup global bot arguments
let botArgs = {
  host: "alwination.id",
  port: 25565,
  version: "1.21.4",
};

const clients = new Set();
const logLines = [];

// ===============================================
// SISTEM ROTASI PROXY SOCKS5 DARI GITHUB
// ===============================================
let socks5Proxies = []; 

async function updateProxyList() {
  try {
    console.log(chalk.cyan("[PROXY] Sedang mengambil daftar proxy SOCKS5 dari GitHub..."));
    const response = await fetch("https://raw.githubusercontent.com/hproxy-com/free-proxy-list/main/socks5.txt");
    const data = await response.text();
    
    socks5Proxies = data
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.includes(':')); 
      
    console.log(chalk.green(`[PROXY] Berhasil mengumpulkan ${socks5Proxies.length} proxy SOCKS5!`));
  } catch (err) {
    console.log(chalk.red(`[PROXY] Gagal mengambil daftar proxy: ${err.message}`));
  }
}

function getRandomProxyConfig() {
  if (socks5Proxies.length === 0) {
    return { enabled: false }; 
  }
  
  const randomProxy = socks5Proxies[Math.floor(Math.random() * socks5Proxies.length)];
  const [host, port] = randomProxy.split(':');
  
  return {
    enabled: true,
    host: host,
    port: parseInt(port, 10)
  };
}

function ansiToHtml(value) {
  const escaped = String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .replace(/\u001b\[38;5;46m/g, '<span style="color:#00ff00">')
    .replace(/\u001b\[38;5;34m/g, '<span style="color:#00aa00">')
    .replace(/\u001b\[31m/g, '<span style="color:#ff5555">')
    .replace(/\u001b\[(?:39|0)m/g, '</span>');
}

function publish(line) {
  line = ansiToHtml(line);
  logLines.push(line);
  if (logLines.length > 200) logLines.shift();
  for (const response of clients) response.write(`data: ${JSON.stringify(line)}\n\n`);
}

createServer((request, response) => {
  if (request.url === "/events") {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    for (const line of logLines) response.write(`data: ${JSON.stringify(line)}\n\n`);
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }
  if (request.method === "POST" && request.url === "/chat") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        const message = JSON.parse(body).message?.trim();
        if (!message || !globalThis.activeBot) return response.writeHead(400).end("Pesan kosong");
        globalThis.activeBot.chat(message);
        publish(`[BOT] ${message}`);
        response.writeHead(204).end();
      } catch { response.writeHead(400).end("JSON tidak valid"); }
    });
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html>
<title>Minecraft Bot</title><style>body{margin:0;background:#111;color:#ddd;font:14px monospace}#log{height:calc(100vh - 52px);overflow:auto;padding:12px;white-space:pre-wrap}form{display:flex;position:fixed;bottom:0;width:100%;height:40px}input{flex:1;background:#222;color:#fff;border:0;padding:0 12px;font:inherit}button{width:100px;background:#3a7;color:white;border:0}</style>
<div id="log"></div><form><input autofocus placeholder="Kirim chat..."><button>Kirim</button></form>
<script>const log=document.querySelector('#log'), source=new EventSource('/events');source.onmessage=e=>{log.innerHTML+=e.data+'<br>';log.scrollTop=log.scrollHeight};document.querySelector('form').onsubmit=async e=>{e.preventDefault();const input=document.querySelector('input');await fetch('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:input.value})});input.value=''}</script>`);
}).listen(webPort, "0.0.0.0", () => console.log(`Web log: http://localhost:${webPort}`));

// Bot class
class MCBot {
  constructor(username, isPrimary = false, password = "kambinghitam", proxyConfig = null) {
    this.username = username;
    this.host = botArgs["host"];
    this.version = botArgs["version"];
    this.password = password; 
    this.authenticated = false;
    this.registerSent = false;
    this.isPrimary = isPrimary; 
    this.proxyConfig = proxyConfig; 
    this.reconnectTimer = null;

    this.initBot();
  }

  initBot() {
    if (this.bot) this.bot.removeAllListeners();
    this.authenticated = false;
    this.registerSent = false;
    this.spawnHandled = false;

    let botOptions = {
      username: this.username,
      host: this.host,
      version: this.version,
    };

    if (this.proxyConfig && this.proxyConfig.enabled) {
      this.log(chalk.yellow(`Menghubungkan menggunakan Proxy SOCKS5 (${this.proxyConfig.host}:${this.proxyConfig.port})...`));
      
      botOptions.connect = (client) => {
        SocksClient.createConnection({
          proxy: {
            host: this.proxyConfig.host,
            port: this.proxyConfig.port,
            type: 5
          },
          command: 'connect',
          destination: {
            host: this.host,
            port: botArgs.port
          }
        }, (err, info) => {
          if (err) {
            return client.emit('error', err); 
          }
          client.setSocket(info.socket);
          client.emit('connect');
        });
      };
    }

    this.bot = mineflayer.createBot(botOptions);
    
    if (this.isPrimary) {
      globalThis.activeBot = this.bot;
    }

    this.initEvents();
  }

  log(...msg) {
    console.log(`[${this.username}]`, ...msg);
    publish(`[${this.username}] ${msg.join(" ")}`);
  }

  initEvents() {
    this.bot.on("login", async () => {
      let botSocket = this.bot._client.socket;
      this.log(
        chalk.ansi256(34)(
          `Logged in to ${
            botSocket.server ? botSocket.server : botSocket._host
          }`
        )
      );
    });

    this.bot.on("messagestr", (message, position) => {
      if (position === "chat") return;
      const playerChat = message.match(/^(?:<|\[)([^>\]]+)(?:>|\])\s*(.*)$/);
      if (playerChat) {
        this.log(`[CHAT] <${playerChat[1]}> ${playerChat[2]}`);
      } else {
        this.log(`[MC ${position}] ${message}`);
      }
      const text = message.toLowerCase();

      if (!this.authenticated && !this.registerSent && /not registered|belum terdaftar|register/.test(text)) {
        this.registerSent = true;
        this.log("Akun belum terdaftar. Register dalam 5 detik...");
        setTimeout(() => {
          this.bot.chat(`/register ${this.password}`);
          this.log("Register dikirim");
        }, 5000);
      }

      if (!this.authenticated && /logged in|already logged|login berhasil|berhasil login|successful login|login successful|hi on minecraft server network|useful commands|if you do not want to login next time|you still do not have an email address|you still do not have second factor enabled/.test(text)) {
        this.authenticated = true;
        this.log("Autentikasi berhasil! Join survival dalam 1 detik...");
        setTimeout(() => {
          this.bot.chat("/joinq survival");
          this.log("Join survival dikirim");
          if (!this.isPrimary) {
            setTimeout(() => {
              this.bot.chat("/pay letkolonel 10k");
              this.log("Pembayaran ke letkolonel dikirim");
            }, 5000);
          }
        }, 1000);
      }
    });

    this.bot.on("chat", (username, message) => {
      this.log(`[CHAT] <${username}> ${message}`);
    });

    this.bot.on("end", async (reason) => {
      this.log(chalk.red(`Disconnected: ${reason}`));

      if (reason == "disconnect.quitting") {
        return;
      }

      // JIKA BOT SIKLUS (Bot 2) TERPUTUS (Proxy Mati / Timed out / Socket closed)
      if (!this.isPrimary) {
        this.log(chalk.yellow("Koneksi gagal/terputus. Langsung mencari SOCKS5 baru tanpa jeda..."));
        
        // Ambil proxy baru
        this.proxyConfig = getRandomProxyConfig();
        
        // Langsung sambungkan ulang TANPA DELAY
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.initBot(); 
        return; 
      }

      // JIKA INI BOT UTAMA (Tanpa Proxy) -> Gunakan delay standar 5 detik
      if (this.reconnectTimer) return;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.initBot();
      }, 5000);
    });

    this.bot.on("spawn", async () => {
      if (this.spawnHandled) return;
      this.spawnHandled = true;
      this.log(chalk.ansi256(46)(`Spawned in`));
      this.log("Login dalam 10 detik...");
      setTimeout(() => {
        this.bot.chat(`/login ${this.password}`);
        this.log(chalk.ansi256(46)(`Login dikirim`));
      }, 10000);
    });

    this.bot.on("error", async (err) => {
      this.log(chalk.red(`Error: ${err.message}`));
    });
  }
}

// ==========================================
// PENGATURAN MULTIPLE BOTS
// ==========================================

function getRandomName() {
  const names = ["Andi", "Dimas", "Budi", "Reza", "Bayu", "Joko", "Putra", "Adit", "Rizky", "Ilham", "Alex", "Kevin", "Rafi", "Fajar", "Dion", "Surya"];
  const randomStr = names[Math.floor(Math.random() * names.length)];
  const randomNumber = Math.floor(Math.random() * 9999);
  return `${randomStr}${randomNumber}`;
}

// 1. Bot Utama (letkolonel) - Tanpa Proxy (IP Asli)
const mainBot = new MCBot("letkolonel", true, "kambinghitam", { enabled: false });

// 2. Bot Siklus (Bot ke-2)
let cycleBot = null;
let cycleIntervalId = null;

function cycleAccount() {
  if (cycleBot && cycleBot.bot) {
    try {
      cycleBot.log("Siklus 5 menit tercapai. Bersiap mengganti AKUN BARU...");
    } catch (e) {}

    try {
      cycleBot.bot.quit();
    } catch (e) {}
  }
  
  setTimeout(() => {
    // BUAT AKUN BARU
    const randomName = getRandomName();
    const randomPass = Math.random().toString(36).substring(2, 10);
    const newProxyConfig = getRandomProxyConfig();
    
    cycleBot = new MCBot(randomName, false, randomPass, newProxyConfig);
    
    if (newProxyConfig.enabled) {
      cycleBot.log(`Membuat AKUN BARU [${randomName}] menggunakan Proxy: ${newProxyConfig.host}:${newProxyConfig.port}`);
    } else {
      cycleBot.log(chalk.red(`Daftar proxy kosong! Mencoba login menggunakan IP Lokal untuk akun [${randomName}]`));
    }

    // Reset Timer 5 Menit
    if (cycleIntervalId) clearInterval(cycleIntervalId);
    cycleIntervalId = setInterval(cycleAccount, 5 * 60 * 1000);
    
  }, 2000);
}


// INISIALISASI
updateProxyList().then(() => {
  cycleAccount(); 
});

setInterval(updateProxyList, 60 * 60 * 1000);