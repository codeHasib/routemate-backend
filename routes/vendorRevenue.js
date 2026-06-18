const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

// Get revenue and paid tickets list for individual vendors
router.get("/revenue-stats", async (req, res) => {
  try {
    const db = req.db || client.db("routemate");
    const vendorId = new ObjectId(req.user.id);

    // 1. Total Tickets/Routes created by this individual vendor
    // Hybrid matching handles cases where IDs are stored as strings or ObjectIds
    const totalAdded = await db.collection("tickets").countDocuments({
      $or: [{ vendorId: vendorId }, { vendorId: req.user.id }],
    });

    // 2. Aggregate Bookings: Accurate Seat Quantities & Financial Revenue
    // We filter strictly by "paid" to represent finalized cash flow
    const bookingStats = await db
      .collection("bookings")
      .aggregate([
        {
          $match: {
            $or: [{ vendorId: vendorId }, { vendorId: req.user.id }],
            status: "paid",
          },
        },
        {
          $group: {
            _id: null,
            totalOrdersCount: { $sum: 1 },
            // ✨ FIX: Sums the length of the selectedSeats array so ticket metrics reflect real volume
            totalSold: {
              $sum: { $size: { $ifNull: ["$selectedSeats", [1]] } },
            },
            totalRevenue: { $sum: "$totalAmount" },
          },
        },
      ])
      .toArray();

    const stats = bookingStats[0] || { totalSold: 0, totalRevenue: 0 };

    // 3. ✨ NEW: Fetch the actual list of individual paid tickets for this vendor
    const paidTickets = await db
      .collection("bookings")
      .find({
        $or: [{ vendorId: vendorId }, { vendorId: req.user.id }],
        status: "paid",
      })
      .project({
        ticketTitle: 1,
        from: 1,
        to: 1,
        selectedSeats: 1,
        totalAmount: 1,
        userName: 1,
        userEmail: 1,
        paymentIntentId: 1,
        createdAt: 1,
      })
      .sort({ createdAt: -1 }) // Show newest sales first
      .toArray();

    // 4. Return combined operational stats and specific line-item history
    res.status(200).json({
      success: true,
      data: {
        totalAdded,
        totalSold: stats.totalSold,
        totalRevenue: stats.totalRevenue,
        paidTickets, // Now available for rendering vendor dashboard tables
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
