// routes/bookingRoutes.js
const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

/**
 * 1. COMMON GET: Fetch relevant bookings dynamically based on user role context
 * URL: GET /api/bookings
 */
router.get("/", async (req, res) => {
  try {
    let query = {};
    if (req.user.role === "vendor") {
      query = { vendorId: req.user.id }; // Vendor sees bookings for their own fleet/tickets
    } else if (req.user.role === "user") {
      query = { userId: req.user.id }; // Regular travelers see only their personal tickets
    } // Admins bypass constraints and can fetch all system bookings

    const db = req.db || client.db("routemate");
    const bookings = await db.collection("bookings").find(query).toArray();
    res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 2. USER: Initialize a fresh reservation booking layout with Atomic Seat Locking
 * URL: POST /api/bookings
 * Expects in req.body: ticketId, vendorId, selectedSeats, totalAmount, ticketTitle, userName, userEmail
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
    } = req.body;

    if (!ticketId || !selectedSeats || !Array.isArray(selectedSeats)) {
      return res.status(400).json({
        success: false,
        message: "Missing required booking metrics parameters.",
      });
    }

    const db = req.db || client.db("routemate");
    const ticketObjectId = new ObjectId(ticketId);

    // A. ATOMIC TRANSACTION CHECK: Find the ticket and check if ANY selected seats are already booked
    const alreadyBookedTicket = await db.collection("tickets").findOne({
      _id: ticketObjectId,
      "seats.seatNo": { $in: selectedSeats },
      "seats.isBooked": true,
    });

    if (alreadyBookedTicket) {
      return res.status(400).json({
        success: false,
        message:
          "One or more selected seats have already been reserved by another user.",
      });
    }

    // B. LOCK THE SEATS: Atomically flip 'isBooked' to true inside the nested seats array structure
    if (selectedSeats.length > 0) {
      await db
        .collection("tickets")
        .updateOne(
          { _id: ticketObjectId, "seats.seatNo": { $in: selectedSeats } },
          { $set: { "seats.$[elem].isBooked": true } },
          { arrayFilters: [{ "elem.seatNo": { $in: selectedSeats } }] },
        );
    }

    // C. CREATE THE MERGED COMPREHENSIVE LEDGER RECORD
    const newBooking = {
      userId: req.user.id,
      userName: userName || req.user.name,
      userEmail: userEmail || req.user.email,
      ticketId: ticketObjectId,
      ticketTitle: ticketTitle || "Route Ticket Listing",
      vendorId: vendorId,
      selectedSeats: selectedSeats,
      totalAmount: parseFloat(totalAmount) || 0,
      status: "pending", // Default baseline status flag
      createdAt: new Date(),
    };

    const result = await db.collection("bookings").insertOne(newBooking);

    res.status(201).json({
      success: true,
      bookingId: result.insertedId,
      message: "Seats held and booking processed successfully!",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 3. VENDOR / ADMIN: Shift Booking State (pending, accepted, paid, rejected)
 * URL: PUT /api/bookings/:id/status
 */
router.put("/:id/status", async (req, res) => {
  try {
    const { status } = req.body; // 'accepted', 'paid', 'rejected'
    if (!["pending", "accepted", "paid", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid system status context string.",
      });
    }

    const bookingId = new ObjectId(req.params.id);
    const db = req.db || client.db("routemate");

    const query =
      req.user.role === "admin"
        ? { _id: bookingId }
        : { _id: bookingId, vendorId: req.user.id };

    const result = await db
      .collection("bookings")
      .updateOne(query, { $set: { status } });

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Booking record unverified." });
    }

    res.status(200).json({
      success: true,
      message: `Booking classification updated to: ${status}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;