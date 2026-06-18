// routes/bookingRoutes.js
const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

// 1. COMMON GET: Fetch relevant bookings dynamically based on user role context
router.get("/", async (req, res) => {
  try {
    let query = {};
    if (req.user.role === "vendor") {
      query = { vendorId: req.user.id }; // Vendor sees bookings for their own fleet/tickets
    } else if (req.user.role === "user") {
      query = { userId: req.user.id }; // Regular travelers see only their personal tickets
    } // Admins bypass constraints and can fetch all system bookings

    const bookings = await req.db.collection("bookings").find(query).toArray();
    res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. USER: Initialize a fresh reservation booking layout
router.post("/", async (req, res) => {
  try {
    const newBooking = {
      ...req.body, // Expects ticketId, vendorId, selectedSeats, totalAmount
      userId: req.user.id,
      status: "pending", // Default baseline status flag
      createdAt: new Date(),
    };

    const result = await req.db.collection("bookings").insertOne(newBooking);
    res
      .status(201)
      .json({
        success: true,
        id: result.insertedId,
        message: "Booking held successfully.",
      });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. VENDOR / ADMIN: Shift Booking State (pending, accepted, paid, rejected)
router.put("/:id/status", async (req, res) => {
  try {
    const { status } = req.body; // 'accepted', 'paid', 'rejected'
    if (!["pending", "accepted", "paid", "rejected"].includes(status)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Invalid system status context string.",
        });
    }

    const bookingId = new ObjectId(req.params.id);
    const query =
      req.user.role === "admin"
        ? { _id: bookingId }
        : { _id: bookingId, vendorId: req.user.id };

    const result = await req.db
      .collection("bookings")
      .updateOne(query, { $set: { status } });
    if (result.matchedCount === 0)
      return res
        .status(404)
        .json({ success: false, message: "Booking record unverified." });

    res
      .status(200)
      .json({
        success: true,
        message: `Booking classification updated to: ${status}`,
      });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// routes/bookingRoutes.js
router.post("/", async (req, res) => {
  try {
    const { ticketId, selectedSeats, totalAmount, vendorId } = req.body;
    const ticketObjectId = new ObjectId(ticketId);

    // 1. ATOMIC TRANSACTION CHECK: Find the ticket and check if ANY selected seats are already booked
    const ticket = await req.db.collection("tickets").findOne({
      _id: ticketObjectId,
      "seats.seatNo": { $in: selectedSeats },
      "seats.isBooked": true,
    });

    if (ticket) {
      return res.status(400).json({
        success: false,
        message:
          "One or more selected seats have already been reserved by another user.",
      });
    }

    // 2. LOCK THE SEATS: Atomically flip 'isBooked' to true inside the nested seats array
    await req.db
      .collection("tickets")
      .updateOne(
        { _id: ticketObjectId, "seats.seatNo": { $in: selectedSeats } },
        { $set: { "seats.$[elem].isBooked": true } },
        { arrayFilters: [{ "elem.seatNo": { $in: selectedSeats } }] },
      );

    // 3. CREATE THE LEDGER RECORD
    const newBooking = {
      userId: req.user.id,
      ticketId: ticketObjectId,
      vendorId,
      selectedSeats,
      totalAmount: parseFloat(totalAmount),
      status: "pending",
      createdAt: new Date(),
    };

    const result = await req.db.collection("bookings").insertOne(newBooking);
    res
      .status(201)
      .json({
        success: true,
        bookingId: result.insertedId,
        message: "Seats held successfully!",
      });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;