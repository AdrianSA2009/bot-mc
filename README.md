# Minecraft Join Bot

Bot Minecraft offline-mode memakai Mineflayer. Bot join server, diam, tampilkan chat, lalu reconnect saat terputus.

## Jalankan

```powershell
npm install
$env:MC_USERNAME='NamaBot'
npm start
```

Default server: `alwination.id:25565`.

Override config:

```powershell
$env:MC_HOST='server.example.com'
$env:MC_PORT='25565'
$env:MC_USERNAME='NamaBot'
$env:MC_VERSION='1.20.1' # kosongkan untuk auto-detect
npm start
```

Server harus mengizinkan offline/cracked login. Gunakan hanya server yang mengizinkan bot.
