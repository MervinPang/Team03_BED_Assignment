//validate inspection function for middleware
function validateInspection(req, res, next) {
  const { stall_id, score, remarks } = req.body;

  if (!stall_id) {
    return res.status(400).json({ error: "stall_id is required." });
  }
  if (score === undefined || score === null) {
    return res.status(400).json({ error: "score is required." });
  }
  if (typeof score !== "number" || score < 0 || score > 100) {
    return res
      .status(400)
      .json({ error: "score must be a number between 0 and 100." });
  }
  if (remarks && typeof remarks !== "string") {
    return res.status(400).json({ error: "remarks must be a string." });
  }

  next();
}

module.exports = { validateInspection };
