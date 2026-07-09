const sql = require("mssql");
const dbConfig = require("../dbConfig");

// Hygiene grade derivation function
function deriveHygieneGrade(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

async function submitInspection(req, res) {
  try {
    const { stall_id, score, remarks } = req.body;
    const officer_id = req.user.user_id;
    const hygiene_grade = deriveHygieneGrade(score);

    const pool = await sql.connect(dbConfig);

    const stallCheck = await pool
      .request()
      .input("stall_id", sql.Int, stall_id)
      .query("SELECT stall_id FROM Stall WHERE stall_id = @stall_id");

    if (stallCheck.recordset.length === 0) {
      return res.status(400).json({ error: "Stall does not exist." });
    }

    const result = await pool
      .request()
      .input("stall_id", sql.Int, stall_id)
      .input("officer_id", sql.Int, officer_id)
      .input("score", sql.Int, score)
      .input("remarks", sql.NVarChar, remarks || null)
      .input("hygiene_grade", sql.Char(1), hygiene_grade).query(`
                INSERT INTO Inspection (stall_id, officer_id, score, remarks, hygiene_grade)
                OUTPUT INSERTED.*
                VALUES (@stall_id, @officer_id, @score, @remarks, @hygiene_grade)
            `);

    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while submitting inspection report." });
  }
}

async function getInspectionHistory(req, res) {
  try {
    const { stallId } = req.params;
    const pool = await sql.connect(dbConfig);

    const result = await pool.request().input("stall_id", sql.Int, stallId)
      .query(`
                SELECT * FROM Inspection
                WHERE stall_id = @stall_id
                ORDER BY inspection_date DESC
            `);

    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while retrieving inspection history." });
  }
}

module.exports = { submitInspection, getInspectionHistory };