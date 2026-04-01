import { automationState } from "../../index.js";
import { chetPaymentStatus } from "../paymentServices.js"
import { log } from "./logConfig.js";
import { FILE_PATH } from "./uploadConfig.js";
import XLSX from "xlsx";
import fs from "fs";





export async function runAutomation() {
    log("🚀 Automation started");

    // Notify frontend that automation started
    global.automationSubscribers.forEach(fn => fn({ event: 'automation_started' }));
    log("⏹ Automation Event Started");
    if (!fs.existsSync(FILE_PATH)) {
        throw new Error("Excel file not found");
    }

    // ✅ Read Excel
    const workbook = XLSX.readFile(FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const transactions = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    console.log(transactions, automationState)
    for (const tx of transactions) {
        if (!automationState.running) {
            log("⏹ Automation stopped by admin");
            break;
        }

        const res = await chetPaymentStatus(tx, tx.AccountNo, tx.Amount);
        console.log(res)
        try {
            if (!res.status) throw new Error(res.error);
            log(`✅ Transaction updated: ${tx.consumerNo}`);
        } catch (err) {
            log(`❌ Transaction failed: ${tx.consumerNo} - ${err.message}`);
        }
    }

    log("✅ All rows processed");
    log("🏁 Automation completed");

    // Notify frontend that automation completed
    global.automationSubscribers.forEach(fn => fn({ event: 'automation_completed' }));
}