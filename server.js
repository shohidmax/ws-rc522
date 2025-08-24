// server.js

const express = require('express');
const http = require('http');
const { MongoClient } = require('mongodb');
const { WebSocketServer } = require('ws'); // Using 'ws' library instead of 'socket.io'
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// --- WebSocket Server Setup ---
const wss = new WebSocketServer({ server });

// --- MongoDB Connection ---
const MONGO_URI = "mongodb+srv://atifsupermart202199:FGzi4j6kRnYTIyP9@cluster0.bfulggv.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(MONGO_URI);
let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db("nfc_attendance");
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    }
}
connectDB();

// --- API Endpoints (remain the same) ---
app.post('/api/nfc', async (req, res) => {
    try {
        const scansCollection = db.collection('scans');
        const scanData = { ...req.body, timestamp: new Date() };
        await scansCollection.insertOne(scanData);
        console.log('New scan received:', scanData);
        
        // Broadcast the new scan data to all connected dashboards
        broadcast({ type: 'new_scan_data', payload: scanData });

        res.json({ name: "MD SARWAR JAHAN", designation: "Developer", verify: "OK" });
    } catch (error) {
        res.status(500).json({ verify: "FAIL", error: "Server error" });
    }
});

app.post('/api/nfcupdat', async (req, res) => {
    try {
        const scansCollection = db.collection('scans');
        const scanData = { ...req.body, timestamp: new Date() };
        await scansCollection.insertOne(scanData);
        console.log('Backup scan received:', scanData);
        broadcast({ type: 'new_scan_data', payload: scanData });
        res.json({ name: "Backup User", designation: "Synced", verify: "OK" });
    } catch (error) {
        res.status(500).json({ verify: "FAIL", error: "Server error" });
    }
});

app.get('/api/stts', (req, res) => {
    res.json({ status: 'active' });
});

// --- WebSocket Logic ---
let esp32Socket = null;

wss.on('connection', (ws) => {
    console.log('A client connected.');

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.log('Received non-JSON message:', message.toString());
            return;
        }

        // Check if it's the ESP32 identifying itself
        if (data.type === 'esp32_connect') {
            console.log(`ESP32 device connected: ${data.deviceId}`);
            esp32Socket = ws;
            ws.isEsp32 = true; // Mark this connection as the ESP32
            broadcast({ type: 'device_status', payload: { status: 'online', deviceId: data.deviceId } });
        }
        // Handle commands from the dashboard
        else if (data.type === 'command') {
            if (esp32Socket && esp32Socket.readyState === ws.OPEN) {
                console.log(`Forwarding command '${data.command}' to ESP32`);
                esp32Socket.send(JSON.stringify({ command: data.command }));
            } else {
                console.log(`Command '${data.command}' received, but ESP32 is not connected.`);
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        if (ws.isEsp32) {
            esp32Socket = null;
            console.log('ESP32 device disconnected.');
            broadcast({ type: 'device_status', payload: { status: 'offline' } });
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Function to broadcast messages to all non-ESP32 clients (dashboards)
function broadcast(data) {
    wss.clients.forEach((client) => {
        if (client !== esp32Socket && client.readyState === client.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// --- Start Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

/*
--- package.json dependencies ---
{
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "mongodb": "^6.7.0",
    "ws": "^8.17.0" 
  }
}
*/
