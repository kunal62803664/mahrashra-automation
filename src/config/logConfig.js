// logConfig.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------
// Generate day-wise log file in logs folder
function getLogFile() {
    console.log(__dirname)
    const logsDir = path.resolve(__dirname, '../../logs');

    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir);
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const fileName = `logs_${yyyy}-${mm}-${dd}.txt`;
    return path.join(logsDir, fileName);
}

const logFile = getLogFile();

// ---------------------------
// Log helper
export function log(message) {
    const timestamp = new Date().toISOString();
    const fullMessage = `[${timestamp}] ${message}\n`;
    process.stdout.write(fullMessage);
    fs.appendFileSync(logFile, fullMessage);
}

