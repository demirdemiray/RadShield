// volkan-server.cjs
// Kullanım: node volkan-server.cjs
// hesaplayici.exe bu dosyayla AYNI klasörde olmalı

const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const PORT = 7474;
const EXE_PATH = path.join(__dirname, "hesaplayici.exe");

const server = http.createServer((req, res) => {
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
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Geçersiz JSON" }));
      return;
    }

    // spawn kullan — argümanlar otomatik escape edilir, boşluklu path sorunu olmaz
    const child = spawn(EXE_PATH, [JSON.stringify(parsed)], {
      timeout: 15000,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", d => { stdout += d; });
    child.stderr.on("data", d => { stderr += d; });

    child.on("close", code => {
      if (code !== 0 && !stdout) {
        console.error("hesaplayici.exe hatası:", stderr || `exit code ${code}`);
        res.writeHead(500);
        res.end(JSON.stringify({ error: stderr || `exe exit code ${code}` }));
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

    child.on("error", err => {
      console.error("spawn hatası:", err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ Volkan server çalışıyor: http://localhost:${PORT}`);
  console.log(`   exe yolu: ${EXE_PATH}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} zaten kullanımda.`);
  } else {
    console.error("Server hatası:", err);
  }
  process.exit(1);
});
