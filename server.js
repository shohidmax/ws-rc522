// server.js

const express = require('express');
const http = require('http');
const { MongoClient } = require('mongodb');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity. For production, restrict this to your dashboard's domain.
        methods: ["GET", "POST"]
    }
});

// --- MongoDB Connection ---
// Updated with your MongoDB Atlas connection string
const MONGO_URI = "mongodb+srv://atifsupermart202199:FGzi4j6kRnYTIyP9@cluster0.bfulggv.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(MONGO_URI);
let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db("nfc_attendance"); // Specify your database name here
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
        process.exit(1); // Exit process with failure
    }
}
connectDB();


// --- API Endpoints ---

// Endpoint for normal scans
app.post('/api/nfc', async (req, res) => {
    try {
        const scansCollection = db.collection('scans'); // Get the 'scans' collection
        const scanData = { ...req.body, timestamp: new Date() };
        await scansCollection.insertOne(scanData);
        console.log('New scan received:', scanData);
        
        // Broadcast the new scan data to all connected dashboards
        io.emit('new_scan_data', scanData);

        // Example verification logic
        res.json({
            name: "MD SARWAR JAHAN",
            designation: "Developer",
            verify: "OK"
        });
    } catch (error) {
        console.error("Error saving scan:", error);
        res.status(500).json({ verify: "FAIL", error: "Server error" });
    }
});

// Endpoint for backup data updates
app.post('/api/nfcupdat', async (req, res) => {
    try {
        const scansCollection = db.collection('scans');
        const scanData = { ...req.body, timestamp: new Date() };
        await scansCollection.insertOne(scanData);
        console.log('Backup scan received:', scanData);
        io.emit('new_scan_data', scanData);
        res.json({
            name: "Backup User",
            designation: "Synced",
            verify: "OK"
        });
    } catch (error) {
        console.error("Error saving backup scan:", error);
        res.status(500).json({ verify: "FAIL", error: "Server error" });
    }
});

// Endpoint for status check
app.get('/api/stts', (req, res) => {
    res.json({ status: 'active' });
});


// --- Socket.IO for Real-time Communication ---

let esp32Socket = null;

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Check if the connection is from our ESP32
    socket.on('esp32_connect', (deviceId) => {
        console.log(`ESP32 device connected: ${deviceId}`);
        esp32Socket = socket;
        // Notify dashboard that device is online
        io.emit('device_status', { status: 'online', deviceId: deviceId });
    });
    
    // Listen for commands from the dashboard and forward to ESP32
    const commands = ['unlock', 'restart', 'toggle-backup', 'toggle-unlock', 'toggle-emergency', 'update-all', 'check-status'];
    commands.forEach(command => {
        socket.on(command, () => {
            if (esp32Socket) {
                console.log(`Forwarding command '${command}' to ESP32`);
                esp32Socket.emit(command);
            } else {
                console.log(`Command '${command}' received, but ESP32 is not connected.`);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (esp32Socket && esp32Socket.id === socket.id) {
            console.log('ESP32 device disconnected.');
            esp32Socket = null;
            // Notify dashboard that device is offline
            io.emit('device_status', { status: 'offline' });
        }
    });
});


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
    "socket.io": "^4.7.5"
  }
}
*/
