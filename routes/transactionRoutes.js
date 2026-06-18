// routes/transactionRoutes.js
const express = require("express");
const router = express.Router();

// 1. USER: Fetch payment ledger list histories from finalized Stripe checkouts
router.get("/history", async (req, res) => {
  try {
    // Only fetch instances where payment status is successfully finalized via webhook/checkout logs
    const query =
      req.user.role === "admin"
        ? { status: "paid" }
        : { userId: req.user.id, status: "paid" };

    const receipts = await req.db
      .collection("bookings")
      .find(query)
      .project({
        ticketId: 1,
        selectedSeats: 1,
        totalAmount: 1,
        paymentIntentId: 1,
        createdAt: 1,
      })
      .toArray();

    res.status(200).json({ success: true, data: receipts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;