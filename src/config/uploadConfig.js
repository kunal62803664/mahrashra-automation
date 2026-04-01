import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import multer from "multer";

const storage = multer.memoryStorage();

export const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel"
        ];

        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error("Only Excel files (.xls, .xlsx) are allowed"));
        }

        cb(null, true);
    }
});


export const FILE_PATH = path.join("uploads", "data.xlsx");

export async function updateTransactionInExcel(TransactionID, tokens, amount) {
    if (!fs.existsSync(FILE_PATH)) {
        throw new Error("Excel file not found");
    }

    // ✅ Read Excel
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    // const workbook = XLSX.readFile(FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    // ✅ Find row by TransactionID
    const index = data.findIndex(row => row.TransactionID == TransactionID);
    console.log(index)
    if (index === -1) {
        throw new Error("Transaction not found");
    }

    // ✅ Ensure required columns exist
    if (!data[index].hasOwnProperty("Status")) data[index]["Status"] = "";
    if (!data[index].hasOwnProperty("AutoMationChecked")) data[index]["AutoMationChecked"] = false;

    // ✅ Apply your logic 
    if (tokens && tokens.amount == amount) {
        data[index]["Status"] = "FAIELD";
        data[index]["AutoMationChecked"] = true;
    } else if (tokens && tokens.amount == 100) {
        data[index]["Status"] = "SUCCESS";
        data[index]["AutoMationChecked"] = true;
    } else {
        data[index]["Status"] = "PENDING";
        data[index]["AutoMationChecked"] = true;
    }

    // ✅ Write back to Excel
    const newSheet = XLSX.utils.json_to_sheet(data);
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, newSheet, sheetName);
    XLSX.writeFile(newWorkbook, FILE_PATH);

    // ✅ Return updated info
    return {
        success: true,
        status: data[index]["Status"],
        amount: tokens?.amount || null,
        TransactionID
    };
}