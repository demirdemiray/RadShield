// volkan-server.js
// Kullanım: node volkan-server.js
// hesaplayici.exe bu dosyayla AYNI klasörde olmalı

const http = require("http");
const { execFile } = require("child_process");
const path = require("path");

const PORT = 7474;
const EXE_PATH = path.join(__dirname, "hesaplayici.exe");

const server = http.createServer((req, res) => {
  // CORS — tarayıcıdan fetch yapabilmek için
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    res.end(JSON.stringify({ error: "Sadece POST kabul edilir" }));
    return;
  }

  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", () => {
    // JSON geçerli mi kontrol et
    try { JSON.parse(body); } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Geçersiz JSON" }));
      return;
    }

    execFile(EXE_PATH, [body], { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        console.error("hesaplayici.exe hatası:", stderr || err.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: stderr || err.message }));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch {
        console.error("JSON parse hatası. stdout:", stdout);
        res.writeHead(500);
        res.end(JSON.stringify({ error: "exe geçersiz JSON döndürdü", raw: stdout }));
      }
    });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ Volkan server çalışıyor: http://localhost:${PORT}`);
  console.log(`   exe yolu: ${EXE_PATH}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} zaten kullanımda. Başka bir terminal penceresi açık mı?`);
  } else {
    console.error("Server hatası:", err);
  }
  process.exit(1);
});
