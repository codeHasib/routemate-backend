// routes/adminRoutes.js
const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

// Helper rule: Protect the route entirely at route container root mount
router.use((req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Access Forbidden. Master Admin authorization required.",
    });
  }
  next();
});

// 0. All users: GET
router.get("/users", async (req, res) => {
  try {
    // Access your database connection
    const db = req.db || client.db("routemate");

    // Fetch all users from your collection
    const allUsers = await db.collection("user").find({}).toArray();

    // Send them back in a clean JSON format
    res.status(200).json({
      success: true,
      users: allUsers,
    });
  } catch (error) {
    console.error("Failed to read user collection:", error.message);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// 1. ADMIN: Change any user's system role mapping hierarchy
router.put("/manage-role", async (req, res) => {
  try {
    const { targetUserId, newRole } = req.body; // targetUserId is string identifier from Better-Auth
    if (!["user", "vendor", "admin"].includes(newRole)) {
      return res.status(400).json({
        success: false,
        message: "Target profile designation rule invalid.",
      });
    }

    const result = await req.db
      .collection("user")
      .updateOne(
        { _id: new ObjectId(targetUserId) },
        { $set: { role: newRole, updatedAt: new Date() } },
      );

    if (result.matchedCount === 0)
      return res
        .status(404)
        .json({ success: false, message: "Target user account not found." });

    res.status(200).json({
      success: true,
      message: `Account access level successfully migrated to: ${newRole}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. ADMIN: Dynamic "Mistrust" action (Force demote a vendor/admin instantly back to user)
router.put("/mistrust-operator", async (req, res) => {
  try {
    const { targetUserId } = req.body;

    const result = await req.db
      .collection("user")
      .updateOne(
        { _id: targetUserId },
        { $set: { role: "user", mistrustedAt: new Date() } },
      );

    if (result.matchedCount === 0)
      return res
        .status(404)
        .json({ success: false, message: "Target accounts missing." });

    // Optional safety cascade: Quarantine active tickets associated with this demoted operator
    await req.db
      .collection("tickets")
      .updateMany(
        { vendorId: targetUserId },
        { $set: { status: "pending", isFeatured: false } },
      );

    res.status(200).json({
      success: true,
      message:
        "Operator mistrusted. Role stripped and associated assets quarantined safely.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Get the tickets
router.get("/tickets", async (req, res) => {
  try {
    const db = req.db || client.db("routemate");

    // Fetch all tickets, sorted newest first
    const allTickets = await db
      .collection("tickets")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      tickets: allTickets,
    });
  } catch (error) {
    console.error("Failed to read tickets collection:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching tickets.",
    });
  }
});

/**
 * PUT /api/admin/tickets/:id/review
 * Purpose: Allows Admin to approve/reject a vendor ticket and flag it for the homepage.
 */
router.put("/tickets/:id/review", async (req, res) => {
  try {
    const { status, isFeatured } = req.body; // status: "active" | "rejected", isFeatured: true | false
    const updateFields = {};

    if (status) updateFields.status = status;
    if (typeof isFeatured === "boolean") updateFields.isFeatured = isFeatured;

    const result = await req.db
      .collection("tickets")
      .updateOne({ _id: new ObjectId(req.params.id) }, { $set: updateFields });

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Ticket record not found." });
    }

    res.status(200).json({
      success: true,
      message: "Ticket status and feature ranking updated.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
