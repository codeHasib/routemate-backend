// routes/vendorTicketRoutes.js
const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

/**
 * POST /api/manage/tickets
 * Purpose: Allow vendors to post a new trip layout. Defaults to pending.
 */
router.post("/", async (req, res) => {
  try {
    if (req.user.role !== "vendor" && req.user.role !== "admin") {
      return res
        .status(403)
        .json({
          success: false,
          message: "Access denied. Vendor privileges required.",
        });
    }

    const newTicket = {
      ...req.body,
      vendorId: req.user.id,
      status: "pending", // Quarantined until Admin approves
      isFeatured: false, // Admin must explicitly flip this to true later
      createdAt: new Date(),
    };

    const result = await req.db.collection("tickets").insertOne(newTicket);
    res
      .status(201)
      .json({
        success: true,
        id: result.insertedId,
        message: "Ticket posted. Awaiting admin approval.",
      });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/manage/tickets/:id
 * Purpose: Allow vendors to update their own schedules, or admins to override anything.
 */
router.put("/:id", async (req, res) => {
  try {
    const ticketId = new ObjectId(req.params.id);
    // Security Guard: Vendors can only update their own records, Admins can update any record
    const query =
      req.user.role === "admin"
        ? { _id: ticketId }
        : { _id: ticketId, vendorId: req.user.id };

    const result = await req.db
      .collection("tickets")
      .updateOne(query, { $set: req.body });
    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Ticket not found or unauthorized change attempt.",
        });
    }

    res
      .status(200)
      .json({ success: true, message: "Ticket modified successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/manage/tickets/:id
 * Purpose: Permanently remove a ticket listing from the database.
 */
router.delete("/:id", async (req, res) => {
  try {
    const ticketId = new ObjectId(req.params.id);
    const query =
      req.user.role === "admin"
        ? { _id: ticketId }
        : { _id: ticketId, vendorId: req.user.id };

    const result = await req.db.collection("tickets").deleteOne(query);
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Ticket not found or unauthorized deletion attempt.",
        });
    }

    res
      .status(200)
      .json({ success: true, message: "Ticket deleted permanently." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;