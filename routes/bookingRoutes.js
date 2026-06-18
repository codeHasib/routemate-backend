const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

/**
 * 1. COMMON GET: Fetch relevant bookings dynamically based on user role context
 * (Kept exactly the same as your working version)
 */
router.get("/", async (req, res) => {
  try {
    let query = {};
    const db = req.db;

    if (req.user.role === "vendor") {
      query = { vendorId: req.user.id };
    } else if (req.user.role === "user") {
      query = { userId: req.user.id };
    }

    const bookings = await db.collection("bookings").find(query).toArray();
    res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 2. USER: Initialize a fresh reservation booking layout
 * URL: POST /api/bookings
 * FIX: Only checks availability; does NOT decrease inventory yet.
 */
router.post("/", async (req, res) => {
  try {
    const {
      ticketId,
      selectedSeats,
      totalAmount,
      vendorId,
      ticketTitle,
      userName,
      userEmail,
      from,
      to,
      departureTime,
      ticketImage,
    } = req.body;

    const db = req.db;
    const ticketObjectId = new ObjectId(ticketId);
    const requestedQuantity = selectedSeats.length;

    // A. Read-only Availability Check
    const ticket = await db
      .collection("tickets")
      .findOne({ _id: ticketObjectId });

    if (!ticket) {
      return res
        .status(404)
        .json({ success: false, message: "Ticket manifest not found." });
    }

    if (ticket.ticketQuantity < requestedQuantity) {
      return res.status(400).json({
        success: false,
        message: `Booking failed: Only ${ticket.ticketQuantity} seats are left.`,
      });
    }

    // B. Log the ledger record directly as "pending"
    const newBooking = {
      userId: req.user.id,
      userName: userName || req.user.name,
      userEmail: userEmail || req.user.email,
      ticketId: ticketObjectId,
      ticketTitle: ticketTitle || "Route Ticket Listing",
      vendorId: vendorId,
      selectedSeats: selectedSeats,
      totalAmount: parseFloat(totalAmount) || 0,
      from: from,
      to: to,
      departureTime: departureTime,
      ticketImage: ticketImage,
      status: "pending", // Initializes on hold pending vendor validation
      createdAt: new Date(),
    };

    const result = await db.collection("bookings").insertOne(newBooking);

    res.status(201).json({
      success: true,
      bookingId: result.insertedId,
      message: "Booking request submitted! Awaiting vendor validation.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 3. VENDOR / ADMIN: Shift Booking State & Process Seat Inventory Contextually
 * URL: PUT /api/bookings/:id/status
 * FIX: Handles subtraction on approval and restoration on rejection.
 */
router.put("/:id/status", async (req, res) => {
  try {
    // Read paymentIntentId if passed from the payment success script
    const { status, paymentIntentId } = req.body;
    if (!["pending", "accepted", "paid", "rejected"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status context." });
    }

    const bookingId = new ObjectId(req.params.id);
    const db = req.db;

    const query =
      req.user.role === "admin"
        ? { _id: bookingId }
        : { _id: bookingId, vendorId: req.user.id };

    // Support user status updates ONLY if they are marking an accepted booking as paid
    const userQuery =
      req.user.role === "user"
        ? { _id: bookingId, userId: req.user.id }
        : query;

    const booking = await db.collection("bookings").findOne(userQuery);

    if (!booking) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Booking record unverified or unauthorized.",
        });
    }

    const seatCount = booking.selectedSeats.length;
    const ticketId = new ObjectId(booking.ticketId);

    // Dynamic fields to save to the database ledger
    let updateFields = { status };
    if (paymentIntentId) {
      updateFields.paymentIntentId = paymentIntentId;
    }

    // Condition A: Deduct seats if moving from pending directly to accepted
    if (status === "accepted" && booking.status === "pending") {
      const ticketUpdate = await db
        .collection("tickets")
        .findOneAndUpdate(
          { _id: ticketId, ticketQuantity: { $gte: seatCount } },
          { $inc: { ticketQuantity: -seatCount } },
        );

      if (!ticketUpdate) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Fleet allocation capacity exhausted.",
          });
      }
    }

    // Condition B: Return seats if an accepted or paid booking gets canceled/rejected
    if (
      status === "rejected" &&
      (booking.status === "accepted" || booking.status === "paid")
    ) {
      await db
        .collection("tickets")
        .updateOne({ _id: ticketId }, { $inc: { ticketQuantity: seatCount } });
    }

    // Finalize state transition in database
    await db
      .collection("bookings")
      .updateOne({ _id: bookingId }, { $set: updateFields });

    res
      .status(200)
      .json({ success: true, message: `Status synchronized to: ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
