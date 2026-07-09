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
      .query("SELECT StallID FROM FoodStall WHERE StallID = @StallID");

    if (stallCheck.recordset.length === 0) {
      return res.status(400).json({ error: "Stall does not exist." });
    }
// Insert into Inspection table
    const inspectionResult = await pool
      .request()
      .input("OfficerUserID", sql.Int, officer_id)
      .input("StallID", sql.Int, stall_id)
      .input("HygieneGrade", sql.Char(1), hygiene_grade).query(`
                INSERT INTO Inspection (OfficerUserID, StallID, HygieneGrade)
                OUTPUT INSERTED.*
                VALUES (@OfficerUserID, @StallID, @HygieneGrade)
            `);

    const newInspection = inspectionResult.recordset[0];

    // Insert remarks into InspectionRemark table, if provided
    let insertedRemark = null;
    if (remarks) {
      const remarkResult = await pool
        .request()
        .input("InspectionID", sql.Int, newInspection.InspectionID)
        .input("RemarkText", sql.VarChar(500), remarks).query(`
                    INSERT INTO InspectionRemark (InspectionID, RemarkText)
                    OUTPUT INSERTED.*
                    VALUES (@InspectionID, @RemarkText)
                `);
      insertedRemark = remarkResult.recordset[0];
    }

    res.status(201).json({
      ...newInspection,
      Remark: insertedRemark ? insertedRemark.RemarkText : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while submitting inspection report." });
  }
}

async function getInspectionHistory(req, res) {
  try {
    const { stallId } = req.params;
    const pool = await sql.connect(dbConfig);

    const result = await pool.request().input("StallID", sql.Int, stallId)
      .query(`
                SELECT i.InspectionID, i.OfficerUserID, i.StallID, i.InspectionDate, i.HygieneGrade, i.InspectionStatus,
                       r.RemarkText
                FROM Inspection i
                LEFT JOIN InspectionRemark r ON i.InspectionID = r.InspectionID
                WHERE i.StallID = @StallID
                ORDER BY i.InspectionDate DESC
            `);

    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while retrieving inspection history." });
  }
}

module.exports = { submitInspection, getInspectionHistory };