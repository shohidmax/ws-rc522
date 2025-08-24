// server.js

const express = require('express');
const http = require('http');
const { MongoClient } = require('mongodb');
const { WebSocketServer } = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
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

// --- API Endpoints ---
app.post('/api/nfc', async (req, res) => {
    try {
        const scansCollection = db.collection('scans');
        const scanData = { ...req.body, timestamp: new Date() };
        await scansCollection.insertOne(scanData);
        console.log('New scan received:', scanData);
        
        const responsePayload = {
            name: "MD SARWAR JAHAN",
            designation: "Developer",
            verify: "OK"
        };
        
        broadcast({ type: 'new_scan_data', payload: { ...scanData, ...responsePayload } });
        res.json(responsePayload);
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
        const responsePayload = {
            name: "Backup User",
            designation: "Synced",
            verify: "OK"
        };
        broadcast({ type: 'new_scan_data', payload: { ...scanData, ...responsePayload } });
        res.json(responsePayload);
    } catch (error) {
        res.status(500).json({ verify: "FAIL", error: "Server error" });
    }
});

app.get('/api/stts', (req, res) => {
    res.json({ status: 'active' });
});

// --- WebSocket Logic ---
let esp32Socket = null;
let lastEspState = null;

wss.on('connection', (ws) => {
    console.log('A client connected.');

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) { return; }

        if (data.type === 'esp32_connect') {
            console.log(`ESP32 device connected: ${data.payload.deviceId} at IP ${data.payload.localIP}`);
            esp32Socket = ws;
            ws.isEsp32 = true;
            lastEspState = data.payload;
            broadcast({ type: 'device_status', payload: { status: 'online', ...data.payload } });
        } 
        else if (data.type === 'esp_state_update') {
            lastEspState = data.payload;
            broadcast({ type: 'esp_state_update', payload: data.payload });
        }
        else if (data.type === 'command') {
            if (esp32Socket && esp32Socket.readyState === ws.OPEN) {
                console.log(`Forwarding command '${data.command}' to ESP32`);
                esp32Socket.send(JSON.stringify({ command: data.command }));
            }
        }
        else if (data.type === 'request_initial_state') {
             if(esp32Socket && lastEspState) {
                ws.send(JSON.stringify({ type: 'device_status', payload: { status: 'online', ...lastEspState } }));
             } else {
                ws.send(JSON.stringify({ type: 'device_status', payload: { status: 'offline' } }));
             }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        if (ws.isEsp32) {
            esp32Socket = null;
            lastEspState = null;
            console.log('ESP32 device disconnected.');
            broadcast({ type: 'device_status', payload: { status: 'offline' } });
        }
    });

    ws.on('error', (error) => console.error('WebSocket error:', error));
});

function broadcast(data) {
    wss.clients.forEach((client) => {
        if (!client.isEsp32 && client.readyState === client.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// --- Start Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
