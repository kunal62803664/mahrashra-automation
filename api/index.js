// server.js
import express from "express";
import bodyParser from "body-parser";
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import session from "express-session";
import XLSX from "xlsx";
import { chetPaymentStatus, payment } from "../src/paymentServices.js";
import { log } from "../src/config/logConfig.js";
import { upload } from "../src/config/uploadConfig.js";
import { runAutomation } from "../src/config/automation.js";
dotenv.config({
    path: process.pkg ? path.join(path.dirname(process.execPath), '.env') : '.env'
});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Safe path for EXE
const basePath = process.pkg ? path.dirname(process.execPath) : __dirname;

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(basePath, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
}));

const PORT = 3000;


// -------------------- AUTH --------------------
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (
        username === process.env.ADMIN_USERNAME &&
        password === process.env.ADMIN_PASSWORD
    ) {
        req.session.isAdmin = true;
        return res.json({ success: true });
    }

    res.status(401).json({ success: false, message: 'Invalid credentials' });
});

function authMiddleware(req, res, next) {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(403).json({ message: 'Unauthorized' });
    }
}



// -------------------- AUTOMATION TOGGLE --------------------
export const automationState = { running: false };

// Function: set automation
export function setAutomation(running) {
    automationState.running = running;
    return automationState.running;
}

// Function: get automation status
export function getAutomation() {
    return automationState.running;
}

// -------------------- AUTOMATION ENDPOINTS --------------------

// Global subscribers array
global.automationSubscribers = [];

app.get('/automation/updates', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendUpdate = (message) => {
        res.write(`data: ${JSON.stringify(message)}\n\n`);
    };

    global.automationSubscribers.push(sendUpdate);

    req.on('close', () => {
        global.automationSubscribers = global.automationSubscribers.filter(fn => fn !== sendUpdate);
    });
});

// Start or Stop Automation
app.post('/automation', authMiddleware, async (req, res) => {
    // const { running } = req.body;
    // if (typeof running !== 'boolean') {
    //     return res.status(400).json({ error: "Invalid 'running' value, must be boolean" });
    // }

    setAutomation(true);

    if (automationState.running) {
        log("🚀 Automation triggered via API");
        await runAutomation().catch(err => {
            log(`❌ Automation failed: ${err.message}`);
            setAutomation(false);
        });
    } else {
        log("⏹ Automation stopped by admin");
    }
    setAutomation(false);
    res.json({ running: automationState.running, message: "Automation Completed" });
});

// Get Automation Status
app.get('/automation', authMiddleware, (req, res) => {
    res.json({ running: getAutomation() });
});





// Get Bill Status
app.get('/get-bill-status', async (req, res) => {
    const consumerNo = req.query.consumerNo;
    const billStatus = await chetPaymentStatus(consumerNo, 1680)
    console.log(billStatus, "ddd")
    res.json({ data: billStatus });
});


// ===============================
// 🚀 ROUTES
// ===============================

app.post(
    "/transactions/upload",
    authMiddleware,
    upload.single("file"),
    async (req, res) => {
        try {
            // ❌ Check if file exists
            if (!req.file) {
                return res.status(400).json({ message: "No file uploaded" });
            }

            // ✅ Ensure 'uploads' folder exists
            const uploadDir = path.join(process.cwd(), "uploads");
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

            // Optional: save the file to disk
            const filePath = path.join(uploadDir, "data.xlsx");
            fs.writeFileSync(filePath, req.file.buffer);

            // ✅ Read Excel directly from memory
            const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });

            // ✅ Basic validation
            if (!data.length) {
                return res.status(400).json({ message: "Excel file is empty" });
            }

            // ✅ Respond with success
            res.status(200).json({
                message: "File uploaded and processed successfully",
                rows: data.length,
                preview: data.slice(0, 5), // show first 5 rows
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({
                message: "Error processing file",
                error: error.message,
            });
        }
    }
);



// ✅ List Transactions (Pagination + Search)
const FILE_PATH = path.join("uploads", "data.xlsx");

app.get("/transactions", authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = "", TransactionID, date } = req.query;

        // ✅ Read Excel file
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        // const workbook = XLSX.readFile(FILE_PATH);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        let data = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        // ✅ SEARCH (like $or)
        if (search) {
            const s = search.toLowerCase();

            data = data.filter(row =>
                String(row.AccountNo || "").toLowerCase().includes(s) ||
                String(row.Operator || "").toLowerCase().includes(s) ||
                String(row.Status || "").toLowerCase().includes(s) ||
                String(row.TransactionID || "").toLowerCase().includes(s)
            );
        }

        // ✅ Exact TransactionID filter
        if (TransactionID) {
            data = data.filter(row => row.TransactionID == TransactionID);
        }

        // ✅ Date filter
        if (date) {
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);

            const end = new Date(date);
            end.setHours(23, 59, 59, 999);

            data = data.filter(row => {
                const rowDate = new Date(row.DateTime);
                return rowDate >= start && rowDate <= end;
            });
        }

        // ✅ SORT (latest first like Mongo)
        data.sort((a, b) => new Date(b.DateTime) - new Date(a.DateTime));

        // ✅ PAGINATION
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const total = data.length;

        const startIndex = (pageNum - 1) * limitNum;
        const paginatedData = data.slice(startIndex, startIndex + limitNum);

        res.json({
            transactions: paginatedData,
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum)
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

// DELETE ALL TRANSACTIONS
// const FILE_PATH = path.join("uploads", "data.xlsx");

app.delete("/transactions/delete-all", authMiddleware, async (req, res) => {
    try {
        if (fs.existsSync(FILE_PATH)) {
            fs.unlinkSync(FILE_PATH); // ✅ delete file
        }

        res.json({
            message: "All transactions deleted successfully (file removed)"
        });

    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({
            message: "Server error",
            error: err.message
        });
    }
});


// ✅ Export Transactions (Excel)
// ✅ Export ALL Transaction Fields (Ordered Excel)
app.get("/transactions/export", authMiddleware, (req, res) => {
    res.download(FILE_PATH, "transactions.xlsx");
})



app.put("/transactions/:id", authMiddleware, async (req, res) => {
    try {
        if (!fs.existsSync(FILE_PATH)) {
            return res.status(404).json({ message: "Excel file not found" });
        }

        const { id } = req.params;
        const updates = req.body; // e.g., { Status: "Success", Amount: 500 }

        // ✅ Read Excel
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        // const workbook = XLSX.readFile(FILE_PATH);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        // ✅ Find row by TransactionID
        const index = data.findIndex(row => row.TransactionID == id);
        if (index === -1) {
            return res.status(404).json({ message: "Transaction not found" });
        }

        // ✅ Update only provided columns
        Object.keys(updates).forEach(key => {
            if (data[index].hasOwnProperty(key)) {
                data[index][key] = updates[key];
            }
        });

        // ✅ Write back to Excel
        const newSheet = XLSX.utils.json_to_sheet(data);
        const newWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWorkbook, newSheet, sheetName);
        XLSX.writeFile(newWorkbook, FILE_PATH);

        res.json({
            message: "Transaction updated successfully",
            transaction: data[index]
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Update failed", error: err.message });
    }
});




app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
});

// -------------------- SERVER --------------------
// app.listen(PORT, () => {
//     log(`Server running on http://localhost:${PORT}`);
// });

// Keep console open when running as EXE
// if (process.pkg) {
//     console.log("Press CTRL+C to exit");
//     setInterval(() => { }, 1000); // prevents immediate exit if server crashes
// }


export default app;