const sql = require("mssql");
const dbConfig = require("../dbConfig");
const rentalModel = require("../models/rentalModel");

async function submitComplaint(req, res) {
  try {
    const { stall_id, complaint_title, complaint_desc } = req.body;
    const customer_id = req.user.id;

    const pool = await sql.connect(dbConfig);

    // Confirm stall exists before inserting
    const stallCheck = await pool
      .request()
      .input("StallID", sql.Int, stall_id)
      .query("SELECT StallID FROM FoodStall WHERE StallID = @StallID");

    if (stallCheck.recordset.length === 0) {
      return res.status(400).json({ error: "Stall does not exist." });
    }

    const result = await pool
      .request()
      .input("UserID", sql.Int, customer_id)
      .input("StallID", sql.Int, stall_id)
      .input("ComplaintTitle", sql.VarChar(100), complaint_title)
      .input("ComplaintDesc", sql.VarChar(500), complaint_desc)
      .query(`
        INSERT INTO Complaint (UserID, StallID, ComplaintTitle, ComplaintDesc)
        OUTPUT INSERTED.*
        VALUES (@UserID, @StallID, @ComplaintTitle, @ComplaintDesc)
      `);

    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while submitting complaint." });
  }
}

async function getComplaintsByStall(req, res) {
  try {
    const { stallId } = req.params;
    const pool = await sql.connect(dbConfig);

    const result = await pool
      .request()
      .input("StallID", sql.Int, stallId)
      .query(`
        SELECT ComplaintID, UserID, StallID, ComplaintTitle, ComplaintDesc, ComplaintStatus, CreatedAt, ResolvedAt
        FROM Complaint
        WHERE StallID = @StallID
        ORDER BY CreatedAt DESC
      `);

    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while retrieving complaints." });
  }
}

async function updateComplaintStatus(req, res) {
  try {
    const { complaintId } = req.params;
    const { status } = req.body;
    const pool = await sql.connect(dbConfig);

    // Confirm the complaint exists, and read the operator of the hawker centre
    // its stall stands in, because that is who is allowed to decide the case
    const complaintCheck = await pool
      .request()
      .input("ComplaintID", sql.Int, complaintId)
      .query(`
        SELECT c.ComplaintID, fs.StallName, hc.HCName, hc.OperatorID
        FROM Complaint c
        JOIN FoodStall fs ON c.StallID = fs.StallID
        JOIN HawkerCentre hc ON fs.HawkerCentreID = hc.HawkerCentreID
        WHERE c.ComplaintID = @ComplaintID
      `);

    if (complaintCheck.recordset.length === 0) {
      return res.status(400).json({ error: "Complaint does not exist." });
    }

    const complaint = complaintCheck.recordset[0];

    /*
     * The operator behind the signed in account is read from the database on
     * every request rather than taken from the token, so that nothing sent by
     * the browser can widen the centres whose cases may be closed.
     */
    const operator = await rentalModel.getOperatorIdForUser(Number(req.user.id));

    if (!operator || !operator.OperatorID) {
      return res.status(403).json({
        error: "Your account is not linked to a hawker centre operator.",
      });
    }

    if (Number(complaint.OperatorID) !== Number(operator.OperatorID)) {
      return res.status(403).json({
        error:
          `${complaint.StallName} is in ${complaint.HCName}, ` +
          "which is run by another operator.",
      });
    }

    // If marking as Resolved, also set ResolvedAt to now
    const resolvedAtClause =
      status === "Resolved" ? ", ResolvedAt = GETDATE()" : "";

    const result = await pool
      .request()
      .input("ComplaintID", sql.Int, complaintId)
      .input("Status", sql.VarChar(30), status)
      .query(`
        UPDATE Complaint
        SET ComplaintStatus = @Status ${resolvedAtClause}
        OUTPUT INSERTED.*
        WHERE ComplaintID = @ComplaintID
      `);

    res.status(200).json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error while updating complaint status." });
  }
}

module.exports = { submitComplaint, getComplaintsByStall, updateComplaintStatus };