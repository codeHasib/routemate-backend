// routes/publicTicketRoutes.js
const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

/**
 * GET /api/public/tickets
 * Purpose: Fetch all active, approved routes for the main search/browse page.
 */

router.get("/", async (req, res) => {
  try {
    const { search, type, sort, page = 1, limit = 9 } = req.query;
    let query = { status: "active" };

    if (search) {
      query.$or = [
        { fromLocation: { $regex: search, $options: "i" } },
        { toLocation: { $regex: search, $options: "i" } },
      ];
    }
    if (type) query.transportType = { $regex: new RegExp(`^${type}$`, "i") };

    // Sorting
    let sortObj = {};
    if (sort === "price-low") sortObj = { price: 1 };
    else if (sort === "price-high") sortObj = { price: -1 };

    // Pagination Logic
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const cursor = req.db
      .collection("tickets")
      .find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    const tickets = await cursor.toArray();
    const total = await req.db.collection("tickets").countDocuments(query); // Needed for pagination UI

    res.status(200).json({
      success: true,
      data: tickets,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/public/tickets/featured
 * Purpose: Fetch a maximum of 8 hand-picked premium tickets for the homepage hero/featured grid.
 */
router.get("/featured", async (req, res) => {
  try {
    const featuredTickets = await req.db
      .collection("tickets")
      .find({ status: "active", isFeatured: true })
      .limit(8)
      .toArray();
    res.status(200).json({
      success: true,
      count: featuredTickets.length,
      data: featuredTickets,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/public/tickets/:id
 * Purpose: Fetch the seat layout and details for a specific trip when clicked.
 */
router.get("/:id", async (req, res) => {
  try {
    const ticket = await req.db
      .collection("tickets")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!ticket) {
      return res
        .status(404)
        .json({ success: false, message: "Ticket not found." });
    }
    res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Invalid ticket ID format." });
  }
});

module.exports = router;
