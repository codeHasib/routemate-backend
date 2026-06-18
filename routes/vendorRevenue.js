const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

// Get revenue
router.get("/revenue-stats", async (req, res) => {
  try {
    const db = req.db || client.db("routemate");
    const vendorId = new ObjectId(req.user.id);

    // 1. Total Tickets Added
    const totalAdded = await db
      .collection("tickets")
      .countDocuments({ vendorId });

    // 2. Aggregate Bookings: Total Sold & Revenue
    // We filter by 'accepted' or 'paid' status to ensure we only count real revenue
    const bookingStats = await db
      .collection("bookings")
      .aggregate([
        {
          $match: { vendorId: vendorId, status: { $in: ["accepted", "paid"] } },
        },
        {
          $group: {
            _id: null,
            totalSold: { $sum: 1 },
            totalRevenue: { $sum: "$totalAmount" },
          },
        },
      ])
      .toArray();

    const stats = bookingStats[0] || { totalSold: 0, totalRevenue: 0 };

    res.status(200).json({
      success: true,
      data: {
        totalAdded,
        totalSold: stats.totalSold,
        totalRevenue: stats.totalRevenue,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
