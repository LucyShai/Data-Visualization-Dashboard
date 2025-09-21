const express = require("express");
const multer = require("multer");
const path = require("path");
const XLSX = require("xlsx");
const fs = require("fs");
const pool = require("./dbConnection"); 
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const UPLOAD_DIR = path.join(__dirname, "uploads");

// Create uploads folder if it doesn’t exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname}`), // Unique filename
});

// Multer config (10MB max, only .xlsx allowed)
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".xlsx") cb(null, true);
    else cb(new Error("Only .xlsx files are allowed"));
  },
});

// Upload & Process Excel File
// POST /api/finances/upload/:userId/:year
app.post(
  "/api/finances/upload/:userId/:year",
  upload.single("file"),
  async (req, res) => {
    const { userId, year } = req.params;

    // Check if file uploaded
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filePath = req.file.path;

    try {
      // 1. Verify user exists
      const [userRows] = await pool.query(
        "SELECT * FROM users WHERE user_id = ?",
        [userId]
      );
      if (userRows.length === 0) {
        fs.unlinkSync(filePath); // Cleanup uploaded file
        return res.status(404).json({ error: "User not found" });
      }

      // 2. Read Excel file (first sheet only)
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) throw new Error("Empty or invalid sheet");

      // Convert sheet to JSON (default empty values to null)
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

      // 3. Extract valid rows (Month + Amount)
      const toInsert = [];
      for (const row of rows) {
        const month = row["Month"] ?? row["month"];
        const amount = row["Amount"] ?? row["amount"];

        if (!month || amount == null || amount === "") continue;

        const num = Number(amount);
        if (Number.isNaN(num)) continue;

        toInsert.push([userId, Number(year), String(month), num]);
      }

      if (toInsert.length === 0) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: "No valid rows found" });
      }

      // 4. Save data in DB (overwrite existing records for same user/year)
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        await conn.query(
          "DELETE FROM financial_records WHERE user_id = ? AND year = ?",
          [userId, year]
        );

        const sql =
          "INSERT INTO financial_records (user_id, year, month, amount) VALUES ?";
        await conn.query(sql, [toInsert]);

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }

      // Remove uploaded file
      fs.unlinkSync(filePath);

      res.json({
        message: "File processed and data saved",
        inserted: toInsert.length,
      });
    } catch (err) {
      // Ensure cleanup if error occurs
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      console.error(err);
      res.status(500).json({ error: err.message || "Internal Server Error" });
    }
  }
);

// Fetch Financial Records
// GET /api/finances/:userId/:year
app.get("/api/finances/:userId/:year", async (req, res) => {
  const { userId, year } = req.params;

  try {
    // 1. Verify user exists
    const [userRows] = await pool.query(
      "SELECT * FROM users WHERE user_id = ?",
      [userId]
    );
    if (userRows.length === 0)
      return res.status(404).json({ error: "User not found" });

    // 2. Fetch financial records for that year
    const [rows] = await pool.query(
      `SELECT record_id, user_id, year, month, amount, created_at
       FROM financial_records
       WHERE user_id = ? AND year = ?
       ORDER BY STR_TO_DATE(CONCAT(?, month), "%Y%B")`,
      [userId, year, year]
    );

    res.json({
      user: { user_id: userRows[0].user_id, name: userRows[0].name },
      year: Number(year),
      records: rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
